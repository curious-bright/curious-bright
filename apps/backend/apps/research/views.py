from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.community.notifications import notify

from .models import Collaboration, ResearchDocument, ResearchDocumentRevision
from .serializers import CollaborationSerializer, ResearchDocumentSerializer, RevisionSerializer

User = get_user_model()


def _can_edit(user, document):
    if document.owner == user:
        return True
    return document.collaborations.filter(user=user, status=Collaboration.Status.ACCEPTED).exists()


class ResearchDocumentViewSet(generics.ListCreateAPIView):
    serializer_class = ResearchDocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return (
            ResearchDocument.objects.filter(
                Q(owner=user) | Q(collaborations__user=user, collaborations__status=Collaboration.Status.ACCEPTED)
            )
            .distinct()
            .select_related("owner", "owner__profile")
            .prefetch_related("collaborations__user__profile")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ResearchDocumentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ResearchDocumentSerializer
    permission_classes = [IsAuthenticated]
    queryset = ResearchDocument.objects.select_related("owner", "owner__profile")

    def get_object(self):
        doc = super().get_object()
        user = self.request.user
        is_collab = doc.collaborations.filter(user=user).exists()
        if doc.owner != user and not is_collab and doc.status != ResearchDocument.Status.PUBLISHED:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to this document.")
        return doc

    def perform_update(self, serializer):
        doc = self.get_object()
        user = self.request.user
        if user != doc.owner:
            # A co-author contributing -> revision -> Collaborator badge via signal
            ResearchDocumentRevision.objects.create(
                document=doc,
                editor=user,
                summary=self.request.data.get("summary", "Edited document"),
            )
        serializer.save()


class InviteCollaboratorView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        doc = get_object_or_404(ResearchDocument, pk=pk)
        if doc.owner != request.user:
            return Response(
                {"code": "forbidden", "message": "Only the document owner can invite collaborators."},
                status=status.HTTP_403_FORBIDDEN,
            )
        username = request.data.get("username")
        if not username:
            return Response(
                {"code": "validation_error", "message": "username is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = get_object_or_404(User, username=username)
        if target == request.user:
            return Response(
                {"code": "validation_error", "message": "You cannot invite yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        collab, created = Collaboration.objects.get_or_create(
            document=doc,
            user=target,
            defaults={"role": request.data.get("role", Collaboration.Role.CO_AUTHOR), "invited_by": request.user},
        )
        if not created and collab.status in (
            Collaboration.Status.DECLINED,
            Collaboration.Status.INVITED,
        ):
            collab.status = Collaboration.Status.INVITED
            collab.save(update_fields=["status"])
        elif not created:
            return Response(
                {"code": "validation_error", "message": "This user already collaborates on the document."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        notify(
            target,
            "research",
            actor=request.user,
            text=f"@{request.user.username} invited you to collaborate on '{doc.title}'",
        )
        return Response(CollaborationSerializer(collab).data, status=status.HTTP_201_CREATED)


class MyInvitationsView(generics.ListAPIView):
    serializer_class = CollaborationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Collaboration.objects.filter(user=self.request.user, status=Collaboration.Status.INVITED)
            .select_related("document__owner", "user__profile")
        )


class RespondToInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        collab = get_object_or_404(Collaboration, pk=pk, user=request.user)
        action = request.data.get("action")
        if action not in ("accept", "decline"):
            return Response(
                {"code": "validation_error", "message": "action must be 'accept' or 'decline'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        collab.status = (
            Collaboration.Status.ACCEPTED if action == "accept" else Collaboration.Status.DECLINED
        )
        collab.save(update_fields=["status"])
        return Response(CollaborationSerializer(collab).data)


class DocumentRevisionsView(generics.ListAPIView):
    serializer_class = RevisionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ResearchDocumentRevision.objects.filter(document_id=self.kwargs["pk"]).select_related("editor")

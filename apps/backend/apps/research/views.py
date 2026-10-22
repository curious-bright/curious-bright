from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.community.notifications import notify
from apps.core.audit import audit_content, changed_fields
from apps.core.models import ContentAuditLog

from .models import Collaboration, ResearchDocument, ResearchDocumentRevision
from .serializers import CollaborationSerializer, ResearchDocumentSerializer, RevisionSerializer

User = get_user_model()


def _can_edit(user, document):
    if document.owner_id == user.id or user.is_staff or user.is_moderator:
        return True
    return document.collaborations.filter(
        user=user, status=Collaboration.Status.ACCEPTED
    ).exists()


def _can_view(user, document):
    if document.status == ResearchDocument.Status.PUBLISHED:
        return True
    return bool(
        document.owner_id == user.id
        or user.is_staff
        or user.is_moderator
        or document.collaborations.filter(
            user=user,
            status__in=[Collaboration.Status.INVITED, Collaboration.Status.ACCEPTED],
        ).exists()
    )


def _visible_documents(user):
    return (
        ResearchDocument.objects.filter(
            Q(owner=user)
            | Q(
                collaborations__user=user,
                collaborations__status__in=[
                    Collaboration.Status.INVITED,
                    Collaboration.Status.ACCEPTED,
                ],
            )
            | Q(status=ResearchDocument.Status.PUBLISHED)
        )
        .distinct()
        .select_related("owner", "owner__profile")
        .prefetch_related("collaborations__user__profile", "revisions")
    )


def _revision(document, editor, summary=""):
    return ResearchDocumentRevision.objects.create(
        document=document,
        editor=editor,
        summary=(summary or "Document saved")[:300],
        title=document.title,
        abstract=document.abstract,
        body=document.body,
        field=document.field,
        status=document.status,
    )


class ResearchDocumentViewSet(generics.ListCreateAPIView):
    serializer_class = ResearchDocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = _visible_documents(self.request.user)
        if self.request.query_params.get("mine") in ("1", "true", "yes"):
            qs = qs.filter(owner=self.request.user)
        if self.request.query_params.get("status"):
            qs = qs.filter(status=self.request.query_params["status"])
        return qs.order_by("-updated_at")

    def perform_create(self, serializer):
        doc = serializer.save(owner=self.request.user)
        _revision(doc, self.request.user, "Created document")
        audit_content(ContentAuditLog.Action.CREATE, doc, self.request.user)


class ResearchDocumentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ResearchDocumentSerializer
    permission_classes = [IsAuthenticated]
    queryset = ResearchDocument.objects.select_related("owner", "owner__profile")

    def get_object(self):
        doc = super().get_object()
        if not _can_view(self.request.user, doc):
            from rest_framework.exceptions import NotFound

            raise NotFound("Document not found.")
        return doc

    def update(self, request, *args, **kwargs):
        doc = self.get_object()
        if not _can_edit(request.user, doc):
            return Response(
                {"code": "forbidden", "message": "Only the owner or an accepted co-author can edit this document."},
                status=status.HTTP_403_FORBIDDEN,
            )
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(doc, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        before = ResearchDocument.all_objects.get(pk=doc.pk)
        summary = str(request.data.get("summary") or "").strip() or "Edited document"
        doc = serializer.save()
        diff = changed_fields(
            before, doc, ["title", "abstract", "body", "field", "status", "organization_id"]
        )
        if diff:
            doc.is_edited = True
            doc.edited_at = timezone.now()
            doc.save(update_fields=["is_edited", "edited_at", "updated_at"])
            _revision(doc, request.user, summary)
            audit_content(
                ContentAuditLog.Action.EDIT, doc, request.user, changes=diff
            )
        return Response(
            ResearchDocumentSerializer(doc, context={"request": request}).data
        )

    def destroy(self, request, *args, **kwargs):
        doc = self.get_object()
        if doc.owner_id != request.user.id and not (
            request.user.is_staff or request.user.is_moderator
        ):
            return Response(
                {"code": "forbidden", "message": "Only the owner can delete this document."},
                status=status.HTTP_403_FORBIDDEN,
            )
        audit_content(ContentAuditLog.Action.DELETE, doc, request.user)
        doc.delete(deleted_by=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RestoreResearchDocumentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        doc = get_object_or_404(ResearchDocument.all_objects, pk=pk)
        if not doc.is_deleted:
            return Response(
                {"code": "validation_error", "message": "This document is not deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if doc.owner_id != request.user.id and not (
            request.user.is_staff or request.user.is_moderator
        ):
            return Response(
                {"code": "forbidden", "message": "Only the owner can restore this document."},
                status=status.HTTP_403_FORBIDDEN,
            )
        window = getattr(settings, "SOFT_DELETE_UNDO_SECONDS", 300)
        if (
            not (request.user.is_staff or request.user.is_moderator)
            and doc.deleted_at
            and timezone.now() - doc.deleted_at > timedelta(seconds=window)
        ):
            return Response(
                {"code": "restore_window_expired", "message": "The undo window for this document has passed."},
                status=status.HTTP_410_GONE,
            )
        doc.restore()
        audit_content(ContentAuditLog.Action.RESTORE, doc, request.user)
        return Response(
            ResearchDocumentSerializer(doc, context={"request": request}).data
        )


class RestoreRevisionView(APIView):
    """Roll a document back to a stored snapshot (creates a new revision)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, revision_id):
        doc = get_object_or_404(ResearchDocument, pk=pk)
        if not _can_edit(request.user, doc):
            return Response(
                {"code": "forbidden", "message": "Only the owner or an accepted co-author can restore a revision."},
                status=status.HTTP_403_FORBIDDEN,
            )
        revision = get_object_or_404(doc.revisions, pk=revision_id)
        doc.title = revision.title or doc.title
        doc.abstract = revision.abstract
        doc.body = revision.body
        doc.field = revision.field
        doc.status = revision.status or doc.status
        doc.is_edited = True
        doc.edited_at = timezone.now()
        doc.save()
        _revision(doc, request.user, f"Restored revision #{revision.pk}")
        audit_content(
            ContentAuditLog.Action.RESTORE,
            doc,
            request.user,
            restored_revision=revision.pk,
        )
        return Response(
            ResearchDocumentSerializer(doc, context={"request": request}).data
        )


class InviteCollaboratorView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        doc = get_object_or_404(ResearchDocument, pk=pk)
        if doc.owner != request.user:
            return Response(
                {"code": "forbidden", "message": "Only the document owner can invite collaborators."},
                status=status.HTTP_403_FORBIDDEN,
            )
        username = (request.data.get("username") or "").strip()
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
        role = request.data.get("role", Collaboration.Role.CO_AUTHOR)
        if role not in Collaboration.Role.values:
            return Response(
                {"code": "validation_error", "message": "Choose co_author or reviewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        collab, created = Collaboration.objects.get_or_create(
            document=doc,
            user=target,
            defaults={"role": role, "invited_by": request.user},
        )
        if not created and collab.status in (
            Collaboration.Status.DECLINED,
            Collaboration.Status.INVITED,
        ):
            collab.status = Collaboration.Status.INVITED
            collab.role = role
            collab.invited_by = request.user
            collab.save(update_fields=["status", "role", "invited_by"])
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
        return Response(
            CollaborationSerializer(collab, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class MyInvitationsView(generics.ListAPIView):
    serializer_class = CollaborationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Collaboration.objects.filter(user=self.request.user, status=Collaboration.Status.INVITED)
            .select_related("document__owner", "user__profile")
            .order_by("-created_at")
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
        return Response(
            CollaborationSerializer(collab, context={"request": request}).data
        )


class DocumentRevisionsView(generics.ListAPIView):
    serializer_class = RevisionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        doc = get_object_or_404(ResearchDocument, pk=self.kwargs["pk"])
        if not _can_view(self.request.user, doc):
            return ResearchDocumentRevision.objects.none()
        return doc.revisions.select_related("editor", "editor__profile")

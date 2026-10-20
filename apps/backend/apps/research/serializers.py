from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

from .models import Collaboration, ResearchDocument, ResearchDocumentRevision


class ResearchDocumentSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    co_authors = serializers.SerializerMethodField()

    class Meta:
        model = ResearchDocument
        fields = [
            "id", "owner", "title", "abstract", "body", "field",
            "status", "co_authors", "created_at", "updated_at",
        ]
        read_only_fields = ["owner", "created_at", "updated_at"]

    def get_co_authors(self, obj):
        collabs = obj.collaborations.filter(status=Collaboration.Status.ACCEPTED).select_related("user__profile")
        return [
            {"username": c.user.username, "role": c.role}
            for c in collabs
        ]


class CollaborationSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    document_title = serializers.CharField(source="document.title", read_only=True)

    class Meta:
        model = Collaboration
        fields = ["id", "document", "document_title", "user", "role", "status", "invited_by", "created_at"]
        read_only_fields = ["invited_by", "status"]


class RevisionSerializer(serializers.ModelSerializer):
    editor = UserSerializer(read_only=True)

    class Meta:
        model = ResearchDocumentRevision
        fields = ["id", "document", "editor", "summary", "created_at"]
        read_only_fields = ["editor"]

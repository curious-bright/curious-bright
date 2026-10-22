from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer

from .models import Collaboration, ResearchDocument, ResearchDocumentRevision


class ResearchDocumentSerializer(serializers.ModelSerializer):
    owner = PublicUserSerializer(read_only=True)
    co_authors = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    revision_count = serializers.SerializerMethodField()

    class Meta:
        model = ResearchDocument
        fields = [
            "id", "owner", "title", "abstract", "body", "field",
            "status", "co_authors", "mine", "can_edit", "revision_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["owner", "created_at", "updated_at"]

    def get_co_authors(self, obj):
        collabs = obj.collaborations.filter(status=Collaboration.Status.ACCEPTED).select_related(
            "user__profile"
        )
        return [
            {"username": c.user.username, "role": c.role}
            for c in collabs
        ]

    def _user(self):
        request = self.context.get("request")
        return request.user if request and request.user.is_authenticated else None

    def get_mine(self, obj):
        user = self._user()
        return bool(user and obj.owner_id == user.id)

    def get_can_edit(self, obj):
        user = self._user()
        if not user or obj.is_deleted:
            return False
        if obj.owner_id == user.id or user.is_staff or user.is_moderator:
            return True
        return obj.collaborations.filter(
            user=user, status=Collaboration.Status.ACCEPTED
        ).exists()

    def get_revision_count(self, obj):
        return obj.revisions.count()

    def validate_status(self, value):
        request = self.context.get("request")
        if (
            request
            and self.instance
            and self.instance.owner_id != request.user.id
            and value != self.instance.status
        ):
            raise serializers.ValidationError("Only the document owner can change its status.")
        return value


class CollaborationSerializer(serializers.ModelSerializer):
    user = PublicUserSerializer(read_only=True)
    document_title = serializers.CharField(source="document.title", read_only=True)

    class Meta:
        model = Collaboration
        fields = ["id", "document", "document_title", "user", "role", "status", "invited_by", "created_at"]
        read_only_fields = ["invited_by", "status"]


class RevisionSerializer(serializers.ModelSerializer):
    editor = PublicUserSerializer(read_only=True)

    class Meta:
        model = ResearchDocumentRevision
        fields = [
            "id", "document", "editor", "summary", "title", "abstract",
            "body", "field", "status", "created_at",
        ]
        read_only_fields = fields

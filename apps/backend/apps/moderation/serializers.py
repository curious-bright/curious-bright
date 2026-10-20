from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

from .models import ModeratorApplication, Report


class ReportSerializer(serializers.ModelSerializer):
    reporter = UserSerializer(read_only=True)
    post_id = serializers.IntegerField(source="post.id", read_only=True)
    post_title = serializers.CharField(source="post.title", read_only=True)
    post_author = serializers.CharField(source="post.author.username", read_only=True)

    class Meta:
        model = Report
        fields = [
            "id", "reporter", "post_id", "post_title", "post_author",
            "reason", "is_resolved", "created_at",
        ]


class ReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ["reason"]

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError("Please describe why you are reporting this post.")
        return value.strip()


class ModeratorApplicationSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ModeratorApplication
        fields = [
            "id", "user", "motivation", "experience", "subjects",
            "status", "review_note", "created_at", "updated_at",
        ]
        read_only_fields = ["status", "review_note", "created_at", "updated_at"]

    def validate_motivation(self, value):
        if len(value.strip()) < 80:
            raise serializers.ValidationError("Please write a more detailed motivation (at least 80 characters).")
        return value.strip()

    def validate_subjects(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("Select at least one subject area.")
        return [str(s) for s in value]

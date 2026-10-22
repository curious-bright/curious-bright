from django.db.models import Q
from rest_framework import serializers

from apps.accounts.serializers import PublicUserSerializer

from .models import Comment, Equation, HelpfulReaction, Like, Notification, Post


class EquationSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    post = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Equation
        fields = ["id", "post", "latex", "description", "created_by", "created_at"]


class CommentSerializer(serializers.ModelSerializer):
    author = PublicUserSerializer(read_only=True)
    # Ownership/parent links are set by the view after permission checks;
    # making them read-only prevents an author from moving a comment to
    # another thread (or onto a post they cannot see) with a PATCH.
    post = serializers.PrimaryKeyRelatedField(read_only=True)
    parent = serializers.PrimaryKeyRelatedField(read_only=True, allow_null=True)
    replies = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    i_found_helpful = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id", "post", "author", "parent", "body", "is_accepted",
            "helpful_count", "replies", "mine", "can_edit", "can_delete",
            "i_found_helpful", "is_edited", "edited_at", "updated_at",
            "is_deleted", "deleted_at", "created_at",
        ]
        read_only_fields = [
            "is_accepted", "helpful_count", "is_deleted", "deleted_at",
            "is_edited", "edited_at", "updated_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_deleted:
            data["body"] = ""
        return data

    def get_replies(self, obj):
        if obj.parent_id:
            return []
        return CommentSerializer(obj.replies.all(), many=True, context=self.context).data

    def get_mine(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.author_id == request.user.id)

    def get_can_edit(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or obj.is_deleted:
            return False
        return obj.author_id == request.user.id

    def get_can_delete(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or obj.is_deleted:
            return False
        user = request.user
        return bool(
            obj.author_id == user.id
            or user.is_staff
            or user.is_moderator
            or (obj.post.organization_id and obj.post.organization and obj.post.organization.memberships.filter(
                user=user,
                role__in=["owner", "admin"],
                status="active",
            ).exists())
        )

    def get_i_found_helpful(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return HelpfulReaction.objects.filter(user=request.user, comment=obj).exists()


class PostListSerializer(serializers.ModelSerializer):
    author = PublicUserSerializer(read_only=True)
    equations = EquationSerializer(many=True, read_only=True)
    liked_by_me = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()
    is_following_author = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    visibility_label = serializers.CharField(source="get_visibility_display", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True, default=None)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True, default=None)

    class Meta:
        model = Post
        fields = [
            "id", "author", "title", "body", "subject", "kind", "academic_level",
            "visibility", "visibility_label", "room", "room_name",
            "organization", "organization_slug",
            "review_status", "attachment_url", "attachment_name", "is_solved",
            "is_edited", "edited_at", "updated_at",
            "like_count", "comment_count", "equations", "liked_by_me",
            "is_following_author", "mine", "can_edit", "can_delete", "created_at",
        ]

    def _user(self):
        request = self.context.get("request")
        return request.user if request and request.user.is_authenticated else None

    def get_liked_by_me(self, obj):
        user = self._user()
        if not user:
            return False
        return Like.objects.filter(user=user, post=obj).exists()

    def get_is_following_author(self, obj):
        user = self._user()
        if not user or obj.author_id == user.id:
            return False
        from apps.accounts.models import Follow

        return Follow.objects.filter(follower=user, followed_id=obj.author_id).exists()

    def get_mine(self, obj):
        user = self._user()
        return bool(user and obj.author_id == user.id)

    def get_can_edit(self, obj):
        user = self._user()
        if not user or obj.is_deleted:
            return False
        return obj.author_id == user.id

    def get_can_delete(self, obj):
        user = self._user()
        if not user or obj.is_deleted:
            return False
        if obj.author_id == user.id or user.is_staff or user.is_moderator:
            return True
        if obj.organization_id and obj.organization:
            return obj.organization.memberships.filter(
                user=user, role__in=["owner", "admin"], status="active"
            ).exists()
        return False

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get("request")
        try:
            url = obj.attachment.url
        except ValueError:
            return None
        return request.build_absolute_uri(url) if request else url


class PostDetailSerializer(PostListSerializer):
    comments = serializers.SerializerMethodField()

    class Meta(PostListSerializer.Meta):
        fields = PostListSerializer.Meta.fields + ["comments"]

    def get_comments(self, obj):
        # Keep deleted top-level comments as tombstones while they still have
        # visible replies, otherwise the thread loses its context. The author's
        # own tombstone (and every tombstone for moderators) must also survive a
        # reload so the undo action remains reachable after deleting a comment
        # that had no replies. Deleted bodies are always blanked by
        # CommentSerializer, so no private text leaks through this widening.
        request = self.context.get("request")
        user = request.user if request and request.user.is_authenticated else None
        if user is not None and (user.is_staff or user.is_moderator):
            qs = Comment.all_objects.filter(post=obj, parent=None)
        else:
            visible = Q(is_deleted=False) | Q(replies__is_deleted=False)
            if user is not None:
                visible |= Q(author=user)
            qs = Comment.all_objects.filter(post=obj, parent=None).filter(visible)
        qs = (
            qs.distinct()
            .select_related("author", "author__profile")
            .prefetch_related("replies__author__profile")
        )
        return CommentSerializer(qs, many=True, context=self.context).data


class PostCreateSerializer(serializers.ModelSerializer):
    equations = EquationSerializer(many=True, required=False)
    attachment = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = Post
        fields = [
            "id", "title", "body", "subject", "kind", "academic_level",
            "visibility", "room", "organization", "attachment", "equations",
        ]

    def validate_attachment(self, file):
        if file is None:
            return file
        if not file.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Only PDF documents can be attached.")
        if file.size > 25 * 1024 * 1024:
            raise serializers.ValidationError("The PDF must be 25 MB or smaller.")
        return file

    def validate_room(self, room):
        request = self.context.get("request")
        if room and request and request.user.is_authenticated:
            if not room.memberships.filter(user=request.user).exists():
                raise serializers.ValidationError("Join the study room before posting to it.")
        return room

    def validate_organization(self, organization):
        request = self.context.get("request")
        if organization and request and request.user.is_authenticated:
            if not organization.memberships.filter(
                user=request.user, status="active"
            ).exists():
                raise serializers.ValidationError("You are not an active member of that organization.")
        return organization

    def validate(self, attrs):
        visibility = attrs.get("visibility", getattr(self.instance, "visibility", Post.Visibility.PUBLIC))
        room = attrs.get("room", getattr(self.instance, "room", None))
        if visibility == Post.Visibility.ROOM_ONLY and not room:
            raise serializers.ValidationError({"room": "Choose a study room for room-only posts."})
        return attrs

    def create(self, validated_data):
        equations = validated_data.pop("equations", [])
        attachment = validated_data.pop("attachment", None)
        request = self.context["request"]
        post = Post.objects.create(author=request.user, **validated_data)
        if attachment:
            post.attachment = attachment
            post.attachment_name = attachment.name
            # Uploaded papers enter the peer-review queue; plain posts publish directly.
            post.review_status = Post.ReviewStatus.PENDING
            post.save(update_fields=["attachment", "attachment_name", "review_status"])
        for eq in equations:
            Equation.objects.create(
                post=post,
                created_by=request.user,
                **{k: v for k, v in eq.items() if k not in ("post", "created_by", "id")},
            )
        return post

    def update(self, instance, validated_data):
        equations = validated_data.pop("equations", None)
        attachment = validated_data.pop("attachment", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if attachment is not None:
            instance.attachment = attachment
            instance.attachment_name = attachment.name
            instance.review_status = Post.ReviewStatus.PENDING
        if attachment is not None:
            instance.save(update_fields=list(validated_data) + ["attachment", "attachment_name", "review_status", "updated_at"])
        else:
            instance.save()
        if equations is not None:
            instance.equations.all().delete()
            request = self.context["request"]
            for eq in equations:
                Equation.objects.create(
                    post=instance,
                    created_by=request.user,
                    **{k: v for k, v in eq.items() if k not in ("post", "created_by", "id")},
                )
        return instance


class LikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Like
        fields = ["id", "post", "created_at"]


class HelpfulReactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = HelpfulReaction
        fields = ["id", "comment", "created_at"]


class NotificationSerializer(serializers.ModelSerializer):
    actor = PublicUserSerializer(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "actor", "verb", "text", "post", "comment", "is_read", "created_at"]

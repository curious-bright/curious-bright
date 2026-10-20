from rest_framework import serializers

from apps.accounts.serializers import UserSerializer

from .models import Comment, Equation, HelpfulReaction, Like, Notification, Post


class EquationSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Equation
        fields = ["id", "post", "latex", "description", "created_by", "created_at"]


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    post = serializers.PrimaryKeyRelatedField(required=False, queryset=Post.objects.all())
    parent = serializers.PrimaryKeyRelatedField(required=False, queryset=Comment.objects.all(), allow_null=True)
    replies = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()
    i_found_helpful = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id", "post", "author", "parent", "body", "is_accepted",
            "helpful_count", "replies", "mine", "i_found_helpful", "created_at",
        ]
        read_only_fields = ["is_accepted", "helpful_count"]

    def get_replies(self, obj):
        if obj.parent_id:
            return []
        return CommentSerializer(obj.replies.all(), many=True, context=self.context).data

    def get_mine(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.author == request.user)

    def get_i_found_helpful(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return HelpfulReaction.objects.filter(user=request.user, comment=obj).exists()


class PostListSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    equations = EquationSerializer(many=True, read_only=True)
    liked_by_me = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            "id", "author", "title", "body", "subject", "kind", "academic_level",
            "review_status", "attachment_url", "attachment_name", "is_solved",
            "like_count", "comment_count", "equations", "liked_by_me", "created_at",
        ]

    def get_liked_by_me(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return Like.objects.filter(user=request.user, post=obj).exists()

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
        qs = obj.comments.filter(parent=None).select_related("author", "author__profile")
        return CommentSerializer(qs, many=True, context=self.context).data


class PostCreateSerializer(serializers.ModelSerializer):
    equations = EquationSerializer(many=True, required=False)
    attachment = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = Post
        fields = [
            "id", "title", "body", "subject", "kind", "academic_level",
            "attachment", "equations",
        ]

    def validate_attachment(self, file):
        if not file.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Only PDF documents can be attached.")
        if file.size > 25 * 1024 * 1024:
            raise serializers.ValidationError("The PDF must be 25 MB or smaller.")
        return file

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
            Equation.objects.create(post=post, created_by=request.user, **{k: v for k, v in eq.items() if k != "post"})
        return post


class LikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Like
        fields = ["id", "post", "created_at"]


class HelpfulReactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = HelpfulReaction
        fields = ["id", "comment", "created_at"]


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "actor", "verb", "text", "post", "comment", "is_read", "created_at"]

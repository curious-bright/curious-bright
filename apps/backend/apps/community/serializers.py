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

    class Meta:
        model = Post
        fields = [
            "id", "author", "title", "body", "subject", "kind", "is_solved",
            "like_count", "comment_count", "equations", "liked_by_me", "created_at",
        ]

    def get_liked_by_me(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return Like.objects.filter(user=request.user, post=obj).exists()


class PostDetailSerializer(PostListSerializer):
    comments = serializers.SerializerMethodField()

    class Meta(PostListSerializer.Meta):
        fields = PostListSerializer.Meta.fields + ["comments"]

    def get_comments(self, obj):
        qs = obj.comments.filter(parent=None).select_related("author", "author__profile")
        return CommentSerializer(qs, many=True, context=self.context).data


class PostCreateSerializer(serializers.ModelSerializer):
    equations = EquationSerializer(many=True, required=False)

    class Meta:
        model = Post
        fields = ["id", "title", "body", "subject", "kind", "equations"]

    def create(self, validated_data):
        equations = validated_data.pop("equations", [])
        request = self.context["request"]
        post = Post.objects.create(author=request.user, **validated_data)
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

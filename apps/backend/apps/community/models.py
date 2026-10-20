from django.conf import settings
from django.db import models


class Post(models.Model):
    class Subject(models.TextChoices):
        MATH = "math", "Math"
        SCIENCE = "science", "Science"
        PROGRAMMING = "programming", "Programming"
        LANGUAGE = "language", "Language"
        RESEARCH = "research", "Research"
        GENERAL = "general", "General knowledge"

    class Kind(models.TextChoices):
        QUESTION = "question", "Question"
        EXPLANATION = "explanation", "Explanation"
        NOTE = "note", "Note"
        RESOURCE = "resource", "Resource"

    class Level(models.TextChoices):
        HIGH_SCHOOL = "high_school", "High school"
        COLLEGE = "college", "College"
        GRADUATE = "graduate", "Graduate"
        PROFESSIONAL = "professional", "Professional"

    class ReviewStatus(models.TextChoices):
        PUBLISHED = "published", "Published"
        PENDING = "pending", "Pending review"
        REJECTED = "rejected", "Rejected"

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts")
    title = models.CharField(max_length=200)
    body = models.TextField()
    subject = models.CharField(max_length=20, choices=Subject.choices, default=Subject.GENERAL)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.NOTE)
    academic_level = models.CharField(max_length=20, choices=Level.choices, default=Level.COLLEGE)
    review_status = models.CharField(max_length=12, choices=ReviewStatus.choices, default=ReviewStatus.PUBLISHED)
    attachment = models.FileField(upload_to="papers/%Y/%m/", null=True, blank=True)
    attachment_name = models.CharField(max_length=255, blank=True)
    is_solved = models.BooleanField(default=False)
    like_count = models.PositiveIntegerField(default=0)
    comment_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Equation(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="equations", null=True, blank=True)
    latex = models.TextField()
    description = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="equations")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.latex[:60]


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="comments")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies")
    body = models.TextField(max_length=4000)
    is_accepted = models.BooleanField(default=False)
    helpful_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.author.username} on {self.post.title}"


class Like(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="likes")
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "post"], name="unique_like_per_user_post"),
        ]


class HelpfulReaction(models.Model):
    """'This helped me' — given to comments (answers/explanations)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="helpful_reactions")
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="helpful_reactions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "comment"], name="unique_helpful_per_user_comment"),
        ]


class Notification(models.Model):
    class VERB(models.TextChoices):
        LIKE = "like", "liked your post"
        COMMENT = "comment", "commented on your post"
        REPLY = "reply", "replied to you"
        MENTION = "mention", "mentioned you"
        FOLLOW = "follow", "started following you"
        HELPFUL = "helpful", "found your answer helpful"
        ACCEPTED = "accepted", "accepted your answer"
        BADGE = "badge", "earned a badge"
        SOLVED = "solved", "marked a post solved"
        RESEARCH = "research", "joined your research document"
        REVIEW = "review", "reviewed your submission"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications_triggered", null=True, blank=True
    )
    verb = models.CharField(max_length=20, choices=VERB.choices)
    text = models.CharField(max_length=300, blank=True)
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    comment = models.ForeignKey(Comment, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.verb} -> {self.user.username}"

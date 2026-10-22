from django.urls import path

from . import views

urlpatterns = [
    path("posts/", views.PostViewSet.as_view(), name="post_list_create"),
    path("posts/<int:pk>/", views.PostDetailView.as_view(), name="post_detail"),
    path("posts/<int:pk>/like/", views.ToggleLikeView.as_view(), name="post_like"),
    path("posts/<int:pk>/solve/", views.MarkSolvedView.as_view(), name="post_solve"),
    path("posts/<int:pk>/restore/", views.RestorePostView.as_view(), name="post_restore"),
    path("posts/<int:pk>/activity/", views.PostActivityView.as_view(), name="post_activity"),
    path("posts/<int:pk>/comments/", views.CommentCreateView.as_view(), name="comment_create"),
    path("comments/<int:pk>/", views.CommentDetailView.as_view(), name="comment_detail"),
    path("comments/<int:pk>/helpful/", views.ToggleHelpfulView.as_view(), name="comment_helpful"),
    path("comments/<int:pk>/accept/", views.AcceptAnswerView.as_view(), name="comment_accept"),
    path("comments/<int:pk>/restore/", views.RestoreCommentView.as_view(), name="comment_restore"),
    path("feed/following/", views.FollowingFeedView.as_view(), name="feed_following"),
    path("feed/discover/", views.DiscoverFeedView.as_view(), name="feed_discover"),
    path("notifications/", views.NotificationListView.as_view(), name="notifications"),
    path("notifications/read-all/", views.MarkNotificationsReadView.as_view(), name="notifications_read"),
]

from django.urls import path

from . import views

urlpatterns = [
    path("messages/conversations/", views.ConversationListCreateView.as_view(), name="conversation_list"),
    path("messages/conversations/<int:pk>/", views.ConversationDetailView.as_view(), name="conversation_detail"),
    path(
        "messages/conversations/<int:pk>/messages/",
        views.ConversationMessageListView.as_view(),
        name="conversation_messages",
    ),
    path(
        "messages/conversations/<int:pk>/read/",
        views.ConversationReadView.as_view(),
        name="conversation_read",
    ),
    path("messages/<int:pk>/", views.MessageDeleteView.as_view(), name="message_delete"),
    path("messages/<int:pk>/report/", views.MessageReportView.as_view(), name="message_report"),
    path("messages/unread/", views.UnreadCountView.as_view(), name="messages_unread"),
    path("messages/blocks/", views.BlockListView.as_view(), name="message_blocks"),
    path(
        "messages/blocks/<str:username>/",
        views.UserBlockView.as_view(),
        name="message_block_user",
    ),
]

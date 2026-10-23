from django.urls import re_path

from apps.messaging import consumers as messaging_consumers

from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/feed/$", consumers.FeedConsumer.as_asgi()),
    re_path(r"^ws/posts/(?P<post_id>\d+)/$", consumers.PostConsumer.as_asgi()),
    re_path(r"^ws/notifications/$", consumers.NotificationConsumer.as_asgi()),
    re_path(r"^ws/rooms/(?P<room_id>\d+)/$", consumers.RoomConsumer.as_asgi()),
    re_path(r"^ws/rooms/(?P<room_id>\d+)/whiteboard/$", consumers.WhiteboardConsumer.as_asgi()),
    re_path(r"^ws/messages/$", messaging_consumers.MessagesConsumer.as_asgi()),
    re_path(
        r"^ws/conversations/(?P<conversation_id>\d+)/$",
        messaging_consumers.ConversationConsumer.as_asgi(),
    ),
]

from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/feed/$", consumers.FeedConsumer.as_asgi()),
    re_path(r"^ws/posts/(?P<post_id>\d+)/$", consumers.PostConsumer.as_asgi()),
    re_path(r"^ws/notifications/$", consumers.NotificationConsumer.as_asgi()),
    re_path(r"^ws/rooms/(?P<room_id>\d+)/$", consumers.RoomConsumer.as_asgi()),
]

from django.urls import path

from . import views

urlpatterns = [
    path("rooms/", views.RoomListCreateView.as_view(), name="room_list_create"),
    path("rooms/<int:pk>/", views.RoomDetailView.as_view(), name="room_detail"),
    path("rooms/<int:pk>/join/", views.JoinRoomView.as_view(), name="room_join"),
    path("rooms/<int:pk>/restore/", views.RestoreRoomView.as_view(), name="room_restore"),
    path("rooms/<int:pk>/members/", views.RoomMembersView.as_view(), name="room_members"),
    path("rooms/<int:pk>/messages/", views.RoomMessagesView.as_view(), name="room_messages"),
    path("rooms/<int:pk>/livekit-token/", views.LiveKitTokenView.as_view(), name="room_livekit_token"),
    path(
        "rooms/<int:pk>/video-sessions/start/",
        views.VideoSessionStartView.as_view(),
        name="room_video_session_start",
    ),
    path(
        "rooms/<int:pk>/video-sessions/<int:session_id>/heartbeat/",
        views.VideoSessionHeartbeatView.as_view(),
        name="room_video_session_heartbeat",
    ),
    path(
        "rooms/<int:pk>/video-sessions/<int:session_id>/end/",
        views.VideoSessionEndView.as_view(),
        name="room_video_session_end",
    ),
    path("livekit/config/", views.LiveKitConfigView.as_view(), name="livekit_config"),
    path("rooms/<int:pk>/whiteboard/", views.WhiteboardStateView.as_view(), name="room_whiteboard"),
]

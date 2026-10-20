from django.urls import path

from . import views

urlpatterns = [
    path("rooms/", views.RoomListCreateView.as_view(), name="room_list_create"),
    path("rooms/<int:pk>/", views.RoomDetailView.as_view(), name="room_detail"),
    path("rooms/<int:pk>/join/", views.JoinRoomView.as_view(), name="room_join"),
    path("rooms/<int:pk>/members/", views.RoomMembersView.as_view(), name="room_members"),
    path("rooms/<int:pk>/messages/", views.RoomMessagesView.as_view(), name="room_messages"),
]

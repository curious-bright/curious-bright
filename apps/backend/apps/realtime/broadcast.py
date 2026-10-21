from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def publish(groups, event, data):
    """Send one event to one or many channel-layer groups (sync context)."""
    layer = get_channel_layer()
    if layer is None:
        return
    if isinstance(groups, str):
        groups = [groups]
    for group in set(groups):
        async_to_sync(layer.group_send)(
            group, {"type": "broadcast", "event": event, "data": data}
        )

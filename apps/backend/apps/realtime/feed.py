from apps.accounts.models import Follow


def feed_groups(author):
    """Everyone whose cached feed could contain this author's posts."""
    followers = Follow.objects.filter(followed=author).values_list("follower_id", flat=True)
    groups = {"feed.discover", f"feed.user.{author.pk}"}
    groups.update(f"feed.user.{follower_id}" for follower_id in followers)
    return groups

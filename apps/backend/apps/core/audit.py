"""Central audit trail for user-editable content."""
from .models import ContentAuditLog


def audit_content(action, obj, actor=None, reason="", **metadata):
    """Record one create/edit/delete/restore/purge action.

    Audit failures must never break the user's request, so this helper keeps
    the call site free of try/except while still returning the row when it is
    useful for tests.
    """
    content_type = f"{obj._meta.app_label}.{obj._meta.model_name}"
    try:
        return ContentAuditLog.objects.create(
            actor=actor if getattr(actor, "is_authenticated", False) else None,
            action=action,
            content_type=content_type,
            object_id=str(getattr(obj, "pk", "") or ""),
            object_repr=str(obj)[:255],
            reason=reason or "",
            metadata=metadata,
        )
    except Exception:  # auditing is observability, not a transaction requirement
        import logging

        logging.getLogger(__name__).exception("Could not write content audit entry")
        return None


def changed_fields(before, after, fields):
    """Return a compact {field: [old, new]} diff for audit metadata."""
    diff = {}
    for field in fields:
        old = getattr(before, field, None)
        new = getattr(after, field, None)
        if old != new:
            diff[field] = [str(old) if old is not None else None, str(new) if new is not None else None]
    return diff

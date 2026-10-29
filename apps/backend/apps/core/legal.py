"""Policy versions and consent helpers.

Policy text lives in the frontend so public pages remain fast and indexable.
This module is the server-side source of truth for the *versions* that are
stored against each acceptance. Bump both versions whenever either policy
changes; every signed-in user will then be asked to re-accept on next use.
"""

from __future__ import annotations

CURRENT_TERMS_VERSION = "2026-10-28"
CURRENT_PRIVACY_VERSION = "2026-10-28"
LEGAL_LAST_UPDATED = "28 October 2026"


def current_versions() -> dict:
    return {
        "terms": CURRENT_TERMS_VERSION,
        "privacy": CURRENT_PRIVACY_VERSION,
        "last_updated": LEGAL_LAST_UPDATED,
    }


def _client_ip(request):
    if request is None:
        return None
    forwarded = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    return forwarded or request.META.get("REMOTE_ADDR") or None


def record_consent(
    user,
    *,
    organization=None,
    request=None,
    accept_terms: bool = False,
    accept_privacy: bool = False,
):
    """Store immutable acceptance rows for the current policy versions."""
    from apps.accounts.models import PolicyConsent

    if not getattr(user, "is_authenticated", False):
        return []
    created = []
    ip_address = _client_ip(request)
    user_agent = (request.META.get("HTTP_USER_AGENT", "") if request else "")[:300]
    choices = (
        (PolicyConsent.PolicyType.TERMS, CURRENT_TERMS_VERSION, accept_terms),
        (PolicyConsent.PolicyType.PRIVACY, CURRENT_PRIVACY_VERSION, accept_privacy),
    )
    for policy_type, version, accepted in choices:
        if not accepted:
            continue
        row, was_created = PolicyConsent.objects.get_or_create(
            user=user,
            organization=organization,
            policy_type=policy_type,
            version=version,
            defaults={
                "ip_address": ip_address,
                "user_agent": user_agent,
            },
        )
        if was_created:
            created.append(row)
    return created


def consent_status(user, *, organization=None) -> dict:
    """Return the current version and whether the user has accepted it."""
    from apps.accounts.models import PolicyConsent

    result = {}
    for policy_type, current in (
        (PolicyConsent.PolicyType.TERMS, CURRENT_TERMS_VERSION),
        (PolicyConsent.PolicyType.PRIVACY, CURRENT_PRIVACY_VERSION),
    ):
        row = (
            PolicyConsent.objects.filter(
                user=user,
                organization=organization,
                policy_type=policy_type,
            )
            .order_by("-accepted_at")
            .only("version", "accepted_at")
            .first()
        )
        result[policy_type.value] = {
            "version": current,
            "accepted_version": row.version if row else None,
            "accepted_at": row.accepted_at.isoformat() if row else None,
            "accepted": bool(row and row.version == current),
        }
    result["last_updated"] = LEGAL_LAST_UPDATED
    return result


def has_current_consent(user, *, organization=None) -> bool:
    status = consent_status(user, organization=organization)
    return status["terms"]["accepted"] and status["privacy"]["accepted"]

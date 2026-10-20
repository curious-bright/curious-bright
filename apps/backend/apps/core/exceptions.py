from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

CODE_MAP = {
    "NotAuthenticated": ("unauthenticated", status.HTTP_401_UNAUTHORIZED),
    "AuthenticationFailed": ("unauthorized", status.HTTP_401_UNAUTHORIZED),
    "PermissionDenied": ("forbidden", status.HTTP_403_FORBIDDEN),
    "Http404": ("not_found", status.HTTP_404_NOT_FOUND),
    "NotFound": ("not_found", status.HTTP_404_NOT_FOUND),
    "ParseError": ("bad_request", status.HTTP_400_BAD_REQUEST),
    "UnsupportedMediaType": ("unsupported_media_type", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
    "MethodNotAllowed": ("method_not_allowed", status.HTTP_405_METHOD_NOT_ALLOWED),
    "Throttled": ("throttled", status.HTTP_429_TOO_MANY_REQUESTS),
    "ValidationError": ("validation_error", status.HTTP_400_BAD_REQUEST),
    "APIException": ("api_error", status.HTTP_500_INTERNAL_SERVER_ERROR),
}


def _error_code(exc):
    for klass in type(exc).__mro__:
        if klass.__name__ in CODE_MAP:
            return CODE_MAP[klass.__name__][0]
    return "api_error"


def _error_status(exc):
    if getattr(exc, "status_code", None):
        return exc.status_code
    for klass in type(exc).__mro__:
        if klass.__name__ in CODE_MAP:
            return CODE_MAP[klass.__name__][1]
    return status.HTTP_500_INTERNAL_SERVER_ERROR


def error_payload(code, message, details=None):
    payload = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return payload


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    code = _error_code(exc)
    # Prefer DRF's normalized detail (Http404 etc. only carry .args on the raw exception)
    if isinstance(response.data, dict) and "detail" in response.data:
        message = response.data["detail"]
    else:
        message = getattr(exc, "detail", None)
    details = None

    if code == "validation_error":
        if isinstance(message, dict):
            details = {
                str(k): [str(x) for x in (v if isinstance(v, (list, tuple)) else [v])]
                for k, v in message.items()
            }
            message = "Validation failed."
        elif isinstance(message, (list, tuple)):
            message = " ".join(str(x) for x in message) or "Validation failed."
        else:
            message = str(message or "Validation failed.")
    elif isinstance(message, dict):
        # e.g. SimpleJWT invalid-token payloads {"detail": ..., "code": ...}
        message = str(message.get("detail") or message)
    else:
        message = str(message or "Something went wrong.")

    response.data = error_payload(code, message, details)
    return response

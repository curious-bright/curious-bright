from rest_framework import status
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


def error_code(exc):
    for klass in type(exc).__mro__:
        if klass.__name__ in CODE_MAP:
            return CODE_MAP[klass.__name__][0]
    return "api_error"


def error_status(exc):
    if getattr(exc, "status_code", None):
        return exc.status_code
    for klass in type(exc).__mro__:
        if klass.__name__ in CODE_MAP:
            return CODE_MAP[klass.__name__][1]
    return status.HTTP_500_INTERNAL_SERVER_ERROR


def error_payload(code, message):
    """The one and only API error envelope: {"code", "message"}."""
    return {"code": code, "message": message}


def _first_message(data):
    """Flatten DRF's nested validation structure into one readable sentence."""
    if isinstance(data, dict):
        for field, value in data.items():
            message = _first_message(value)
            if not message:
                continue
            if field in ("detail", "non_field_errors"):
                return message
            return f"{str(field).replace('_', ' ').capitalize()}: {message}"
        return ""
    if isinstance(data, (list, tuple)):
        for item in data:
            message = _first_message(item)
            if message:
                return message
        return ""
    return str(data) if data else ""


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    # Auth-flow exceptions can choose a stable, specific code while keeping the
    # shared {"code", "message"} envelope intact.
    code = getattr(exc, "api_code", None) or error_code(exc)
    message = _first_message(response.data)
    if not message:
        message = _first_message(getattr(exc, "detail", None))
    if not message:
        message = "Something went wrong."

    response.data = error_payload(code, message)
    return response

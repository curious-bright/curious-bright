import logging
import uuid

from django.http import JsonResponse

from .exceptions import error_payload

logger = logging.getLogger(__name__)


class RequestIDMiddleware:
    """Attach a correlation id to every request/response.

    The id travels in the ``X-Request-ID`` response header (never in the error
    body, which is strictly ``{code, message}``) and is included in error logs
    so production failures can be traced end to end.
    """

    header = "X-Request-ID"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get(self.header) or uuid.uuid4().hex
        request.request_id = request_id
        response = self.get_response(request)
        response[self.header] = request_id
        return response


class ApiErrorMiddleware:
    """Safety net for ``/api/`` paths.

    Any unhandled exception or HTML error page (404/500) is converted to the
    standard ``{"code", "message"}`` JSON shape.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return self.process_response(request, response)

    def process_exception(self, request, exception):
        if not request.path.startswith("/api/"):
            return None
        logger.exception(
            "Unhandled API error on %s (request_id=%s)",
            request.path,
            getattr(request, "request_id", "-"),
        )
        http_status = getattr(exception, "status_code", None) or 500
        return JsonResponse(
            error_payload("internal_error", "An unexpected error occurred."),
            status=http_status,
        )

    def process_response(self, request, response):
        if not request.path.startswith("/api/"):
            return response
        if response.status_code not in (404, 500):
            return response
        content_type = response.get("Content-Type", "")
        if "application/json" in content_type:
            return response
        code = "not_found" if response.status_code == 404 else "internal_error"
        message = (
            "The requested endpoint does not exist."
            if response.status_code == 404
            else "An unexpected error occurred."
        )
        logger.warning(
            "HTML %s on API path %s (request_id=%s)",
            response.status_code,
            request.path,
            getattr(request, "request_id", "-"),
        )
        return JsonResponse(error_payload(code, message), status=response.status_code)

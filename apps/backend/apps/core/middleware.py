import logging

from django.http import JsonResponse

logger = logging.getLogger(__name__)


class ApiErrorMiddleware:
    """Safety net: any unhandled exception on an /api/ path returns the
    standard {"code", "message"} shape instead of an HTML 500 page."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if not request.path.startswith("/api/"):
            return None
        logger.exception("Unhandled API error on %s", request.path)
        status = 500
        if getattr(exception, "status_code", None):
            status = exception.status_code
        return JsonResponse(
            {"code": "internal_error", "message": "An unexpected error occurred."},
            status=status,
        )

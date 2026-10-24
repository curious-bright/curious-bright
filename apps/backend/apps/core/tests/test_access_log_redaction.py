import json
import logging
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from apps.core.logging import RedactingAccessFormatter, RedactSensitiveQueryFilter


class AccessLogRedactionTests(SimpleTestCase):
    def _record(self, path):
        return logging.LogRecord(
            "uvicorn.access",
            logging.INFO,
            __file__,
            1,
            '%s - "%s %s %s" %s',
            ("1.2.3.4:0", "WebSocket", path, "HTTP/1.1", 200),
            None,
        )

    def test_access_formatter_masks_socket_credentials(self):
        formatter = RedactingAccessFormatter(
            fmt='%(client_addr)s - "%(request_line)s" %(status_code)s'
        )
        output = formatter.format(
            self._record("/ws/messages/?ticket=super-secret-ticket&keep=1")
        )

        self.assertNotIn("super-secret-ticket", output)
        self.assertIn("ticket=[redacted]", output)
        self.assertIn("keep=1", output)
        self.assertIn("/ws/messages/", output)

    def test_filter_masks_legacy_token_parameter(self):
        record = self._record("/ws/notifications/?token=eyJhbGciOi.abc&keep=1")

        self.assertTrue(RedactSensitiveQueryFilter().filter(record))

        self.assertEqual(
            record.args[2],
            "/ws/notifications/?token=[redacted]&keep=1",
        )

    def test_unrelated_query_parameters_are_untouched(self):
        record = self._record("/api/feed/discover/?page=1&tokenizer=word")
        RedactSensitiveQueryFilter().filter(record)

        self.assertEqual(record.args[2], "/api/feed/discover/?page=1&tokenizer=word")

    def test_uvicorn_log_config_uses_the_redacting_formatter(self):
        config_path = Path(settings.BASE_DIR) / "config" / "logging.json"
        with config_path.open(encoding="utf-8") as handle:
            config = json.load(handle)

        self.assertEqual(
            config["formatters"]["access"]["()"],
            "apps.core.logging.RedactingAccessFormatter",
        )

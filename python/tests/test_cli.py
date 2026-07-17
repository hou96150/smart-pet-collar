import io
import json
import unittest
from contextlib import redirect_stdout
from urllib import request
from unittest.mock import patch

from pet_collar.cli import main
from pet_collar.hardware import SafeMockBuzzer


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.body).encode("utf-8")


class CliTests(unittest.TestCase):
    def test_cli_outputs_simulation_event(self):
        output = io.StringIO()
        buzzer = SafeMockBuzzer()
        with redirect_stdout(output):
            exit_code = main(
                [
                    "--emotion",
                    "fearful_aggressive",
                    "--confidence",
                    "0.86",
                    "--risk-level",
                    "high",
                ],
                buzzer=buzzer,
            )

        event = json.loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(event["source"], "simulation")
        self.assertEqual(event["riskLevel"], "high")
        self.assertEqual(buzzer.alert_count, 1)

    @patch("pet_collar.cli.request.OpenerDirector")
    def test_cli_posts_with_http_only_opener_and_outputs_backend_event(
        self, opener_director
    ):
        backend_event = {
            "id": "server-event",
            "timestamp": "2026-07-17T00:00:00.000Z",
            "emotion": "fearful_aggressive",
            "confidence": 0.86,
            "riskLevel": "high",
            "source": "simulation",
            "audioFile": None,
        }
        opener = opener_director.return_value
        opener.open.return_value = FakeResponse(backend_event)
        output = io.StringIO()
        buzzer = SafeMockBuzzer()

        with redirect_stdout(output):
            exit_code = main(
                [
                    "--emotion",
                    "fearful_aggressive",
                    "--confidence",
                    "0.86",
                    "--server-url",
                    "http://127.0.0.1:3000/",
                ],
                buzzer=buzzer,
            )

        sent_request = opener.open.call_args.args[0]
        handlers = [call.args[0] for call in opener.add_handler.call_args_list]
        sent_payload = json.loads(sent_request.data.decode("utf-8"))
        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(output.getvalue()), backend_event)
        self.assertEqual(sent_request.full_url, "http://127.0.0.1:3000/api/events")
        self.assertEqual(
            sent_payload,
            {
                "emotion": "fearful_aggressive",
                "confidence": 0.86,
                "source": "simulation",
                "audioFile": None,
            },
        )
        proxy_handler = next(
            handler for handler in handlers if isinstance(handler, request.ProxyHandler)
        )
        self.assertTrue(any(isinstance(handler, request.HTTPHandler) for handler in handlers))
        self.assertFalse(
            any(isinstance(handler, request.HTTPSHandler) for handler in handlers)
        )
        self.assertEqual(proxy_handler.proxies, {})
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 10)
        self.assertEqual(buzzer.alert_count, 1)

    @patch("pet_collar.cli.request.urlopen")
    def test_https_backend_keeps_urllib_urlopen_path(self, urlopen):
        backend_event = {
            "id": "server-event",
            "timestamp": "2026-07-18T00:00:00.000Z",
            "emotion": "happy",
            "confidence": 0.8,
            "riskLevel": "low",
            "source": "simulation",
            "audioFile": None,
        }
        urlopen.return_value = FakeResponse(backend_event)

        with redirect_stdout(io.StringIO()):
            main(
                [
                    "--emotion",
                    "happy",
                    "--confidence",
                    "0.8",
                    "--server-url",
                    "https://example.test",
                ]
            )

        self.assertEqual(
            urlopen.call_args.args[0].full_url,
            "https://example.test/api/events",
        )

    def test_non_high_risk_event_does_not_alert_buzzer(self):
        buzzer = SafeMockBuzzer()

        with redirect_stdout(io.StringIO()):
            main(
                [
                    "--emotion",
                    "happy",
                    "--confidence",
                    "0.8",
                    "--risk-level",
                    "low",
                ],
                buzzer=buzzer,
            )

        self.assertEqual(buzzer.alert_count, 0)

    @patch("pet_collar.cli.SafeMockBuzzer")
    def test_default_buzzer_is_safe_mock(self, safe_mock_buzzer):
        with redirect_stdout(io.StringIO()):
            main(
                [
                    "--emotion",
                    "fearful_aggressive",
                    "--confidence",
                    "0.86",
                    "--risk-level",
                    "high",
                ]
            )

        safe_mock_buzzer.assert_called_once_with()
        safe_mock_buzzer.return_value.alert.assert_called_once_with()

    def test_offline_mode_requires_risk_level(self):
        with self.assertRaises(SystemExit) as context:
            main(["--emotion", "happy", "--confidence", "0.8"])

        self.assertEqual(context.exception.code, 2)


if __name__ == "__main__":
    unittest.main()

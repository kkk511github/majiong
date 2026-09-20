import argparse
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "server-renewal-reminder.py"
SPEC = importlib.util.spec_from_file_location("server_renewal_reminder", SCRIPT)
reminder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reminder)
FAKE_TOKEN = "123456789:synthetic_test_credential_0123456789"
FAKE_CHAT_ID = "-1001234567890"


def at(value):
    return datetime.fromisoformat(value + "+08:00")


class RenewalReminderTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="renewal-reminder-test-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.config = self.directory / "existing-report-config.json"
        self.token = self.directory / "existing-token"
        self.state = self.directory / "private" / "state.json"
        self.config.write_text(json.dumps({"chatId": FAKE_CHAT_ID, "schedules": [{"id": "daily"}]}), encoding="utf-8")
        self.token.write_text(FAKE_TOKEN, encoding="utf-8")
        self.options = argparse.Namespace(check=False, config=str(self.config), token_file=str(self.token), state=str(self.state))

    def run_at(self, value, check=False, chat_id=FAKE_CHAT_ID):
        self.options.check = check
        environment = {} if chat_id is None else {"TELEGRAM_RENEWAL_CHAT_ID": chat_id}
        with patch.dict(reminder.os.environ, environment, clear=True), patch.object(reminder, "now_beijing", return_value=at(value)):
            return reminder.run(self.options)

    def response(self):
        return io.BytesIO(json.dumps({"ok": True, "result": {"message_id": 42, "chat": {"id": int(FAKE_CHAT_ID)}}}).encode("utf-8"))

    def load_state(self):
        return json.loads(self.state.read_text(encoding="utf-8"))

    def test_check_is_pure_before_first_due(self):
        with patch.object(Path, "read_text", side_effect=AssertionError("must not read any files")), patch.object(reminder.urllib.request, "urlopen") as network:
            result, code = self.run_at("2026-09-20T15:00:00", check=True, chat_id=None)
        self.assertEqual(code, 0)
        self.assertEqual(result, {"base": "2026-09-18", "interval_days": 20, "first_due": "2026-10-08", "latest_due": None,
                                  "next_due": "2026-10-08", "time": "09:00", "timezone": "Asia/Shanghai", "message": "服务器即将到期，请及时续费"})
        self.assertFalse(self.state.parent.exists())
        network.assert_not_called()

    def test_due_dates_and_exact_beijing_time(self):
        for day, next_day in [("2026-10-08", "2026-10-28"), ("2026-10-28", "2026-11-17"), ("2026-11-17", "2026-12-07")]:
            with self.subTest(day=day):
                latest, next_due = reminder.boundaries(at(day + "T09:00:00"))
                self.assertEqual(latest.date().isoformat(), day)
                self.assertEqual(next_due.date().isoformat(), next_day)
                self.assertEqual(latest.hour, 9)
        latest, _ = reminder.boundaries(datetime.fromisoformat("2026-10-08T01:00:00+00:00"))
        self.assertEqual(latest, at("2026-10-08T09:00:00"))

    def test_never_backfills_september_18_or_sends_early_or_reads_a_token(self):
        for value in ["2026-09-18T09:00:00", "2026-09-20T09:00:00", "2026-10-07T09:00:00", "2026-10-08T08:59:59"]:
            with self.subTest(value=value), patch.object(reminder, "read_token") as read, patch.object(reminder.urllib.request, "urlopen") as network:
                result, code = self.run_at(value, chat_id=None)
                self.assertEqual((result["status"], code), ("not_due", 0))
                self.assertFalse(self.state.parent.exists())
                read.assert_not_called()
                network.assert_not_called()

    def test_three_periods_send_exact_text_once_with_durable_private_marker(self):
        def send(request, timeout):
            data = json.loads(request.data)
            self.assertEqual(data, {"chat_id": FAKE_CHAT_ID, "text": "服务器即将到期，请及时续费"})
            self.assertEqual(request.method, "POST")
            self.assertEqual(timeout, 20)
            self.assertTrue(any(entry["status"] == "sending" for entry in self.load_state()["days"].values()))
            self.assertEqual(self.state.stat().st_mode & 0o777, 0o600)
            return self.response()

        with patch.object(reminder.urllib.request, "urlopen", side_effect=send) as network:
            for day in ["2026-10-08", "2026-10-28", "2026-11-17"]:
                self.assertEqual(self.run_at(day + "T09:00:00")[0]["status"], "sent")
                with patch.object(reminder, "read_token") as read:
                    result, code = self.run_at(day + "T09:01:00")
                    self.assertEqual((result["status"], code), ("already_recorded", 0))
                    read.assert_not_called()
            self.assertEqual(network.call_count, 3)
        self.assertNotIn(FAKE_TOKEN, self.state.read_text())

    def test_delayed_recovery_only_sends_the_latest_period(self):
        with patch.object(reminder.urllib.request, "urlopen", side_effect=lambda *a, **k: self.response()) as network:
            first, _ = self.run_at("2026-10-09T10:00:00")
            self.assertEqual(first["due_date"], "2026-10-08")
            second, _ = self.run_at("2026-11-18T10:00:00")
            self.assertEqual(second["due_date"], "2026-11-17")
            self.assertEqual(set(self.load_state()["days"]), {"2026-10-08", "2026-11-17"})
            self.assertEqual(network.call_count, 2)

    def test_nondue_day_after_a_sent_period_does_not_read_credentials(self):
        with patch.object(reminder.urllib.request, "urlopen", return_value=self.response()):
            self.run_at("2026-10-08T09:00:00")
        with patch.object(reminder, "read_token") as read, patch.object(reminder.urllib.request, "urlopen") as network:
            result, _ = self.run_at("2026-10-10T09:00:00", chat_id=None)
            self.assertEqual(result["delivery_status"], "sent")
            read.assert_not_called()
            network.assert_not_called()

    def test_connection_error_timeout_and_bad_response_are_uncertain_and_never_retried(self):
        for outcome in [TimeoutError("https://api.telegram.org/bot" + FAKE_TOKEN), urllib.error.URLError(FAKE_TOKEN), b"invalid-json"]:
            with self.subTest(outcome=type(outcome).__name__):
                self.state.unlink(missing_ok=True)
                kwargs = {"side_effect": outcome} if isinstance(outcome, Exception) else {"return_value": io.BytesIO(outcome)}
                with patch.object(reminder.urllib.request, "urlopen", **kwargs) as network:
                    result, code = self.run_at("2026-10-08T09:00:00")
                    self.assertEqual((result["status"], code), ("uncertain", 1))
                    repeated, _ = self.run_at("2026-10-09T09:00:00")
                    self.assertEqual(repeated["delivery_status"], "uncertain")
                    self.assertEqual(network.call_count, 1)
                    self.assertNotIn(FAKE_TOKEN, self.state.read_text())

    def test_http_error_never_prints_its_token_url(self):
        output, errors = io.StringIO(), io.StringIO()
        error = urllib.error.HTTPError("https://api.telegram.org/bot" + FAKE_TOKEN, 503, FAKE_TOKEN, {}, None)
        with patch.dict(reminder.os.environ, {"TELEGRAM_RENEWAL_CHAT_ID": FAKE_CHAT_ID}, clear=True), patch.object(reminder, "now_beijing", return_value=at("2026-10-08T09:00:00")), patch.object(reminder.urllib.request, "urlopen", side_effect=error) as network, redirect_stdout(output), redirect_stderr(errors):
            code = reminder.main(["--config", str(self.config), "--token-file", str(self.token), "--state", str(self.state)])
        self.assertEqual(code, 1)
        network.assert_called_once()
        self.assertNotIn(FAKE_TOKEN, output.getvalue() + errors.getvalue())
        self.assertNotIn("https://", errors.getvalue())

    def test_interrupted_send_becomes_uncertain_without_network_or_token_read(self):
        self.state.parent.mkdir(mode=0o700)
        reminder.save_state(self.state, {**reminder.STATE_HEADER, "days": {"2026-10-08": {"status": "sending"}}})
        with patch.object(reminder, "read_token") as read, patch.object(reminder.urllib.request, "urlopen") as network:
            result, _ = self.run_at("2026-10-09T09:00:00", chat_id=None)
            self.assertEqual(result["delivery_status"], "uncertain")
            self.assertEqual(self.load_state()["days"]["2026-10-08"]["reason"], "interrupted_delivery")
            read.assert_not_called()
            network.assert_not_called()

    def test_missing_or_conflicting_recipient_fails_before_token_read(self):
        cases = [{"chatId": "-1"}, {"chatId": FAKE_CHAT_ID, "schedules": [{"chatId": "-2"}]}, {"chatId": FAKE_CHAT_ID, "chat_id": "-3"}]
        for config in cases:
            with self.subTest(config=config):
                self.config.write_text(json.dumps(config))
                with patch.object(reminder, "read_token") as read, patch.object(reminder.urllib.request, "urlopen") as network:
                    with self.assertRaises(reminder.ReminderError):
                        self.run_at("2026-10-08T09:00:00")
                    read.assert_not_called()
                    network.assert_not_called()
        self.config.write_text('{"chatId":"-1","chatId":"-1001234567890"}')
        with self.assertRaises(reminder.ReminderError):
            self.run_at("2026-10-08T09:00:00")

    def test_missing_or_invalid_private_recipient_fails_before_token_or_network(self):
        for chat_id in [None, "", "123", "0", "-0", "-01", " -1001234567890", "-abc", "-9223372036854775809", "-" + "9" * 100]:
            with self.subTest(chat_id=chat_id), patch.object(reminder, "read_token") as read, patch.object(reminder.urllib.request, "urlopen") as network:
                with self.assertRaises(reminder.ReminderError):
                    self.run_at("2026-10-08T09:00:00", chat_id=chat_id)
                read.assert_not_called()
                network.assert_not_called()

    def test_existing_numeric_chat_id_is_normalized_without_changing_the_destination(self):
        self.config.write_text(json.dumps({"chatId": int(FAKE_CHAT_ID), "schedules": [{"chatId": FAKE_CHAT_ID}]}))
        self.assertEqual(reminder.configured_recipient(self.config, FAKE_CHAT_ID), FAKE_CHAT_ID)
        with patch.object(reminder.urllib.request, "urlopen", return_value=self.response()) as network:
            result, code = self.run_at("2026-10-08T09:00:00")
            self.assertEqual((result["status"], code), ("sent", 0))
            self.assertEqual(json.loads(network.call_args.args[0].data)["chat_id"], FAKE_CHAT_ID)

    def test_corrupt_state_and_concurrent_runner_fail_closed(self):
        self.state.parent.mkdir(mode=0o700)
        self.state.write_text("not json")
        with patch.object(reminder.urllib.request, "urlopen") as network:
            with self.assertRaises(reminder.ReminderError):
                self.run_at("2026-10-08T09:00:00")
            self.state.unlink()
            with reminder.state_lock(self.state):
                result, code = self.run_at("2026-10-08T09:00:00")
                self.assertEqual((result["status"], code), ("already_running", 0))
            network.assert_not_called()

    def test_failed_initial_state_write_never_attempts_network(self):
        with patch.object(reminder, "save_state", side_effect=reminder.ReminderError("write failed")), patch.object(reminder.urllib.request, "urlopen") as network:
            with self.assertRaises(reminder.ReminderError):
                self.run_at("2026-10-08T09:00:00")
            network.assert_not_called()

    def test_failure_saving_success_keeps_sending_marker_and_prevents_duplicate(self):
        save = reminder.save_state
        calls = 0

        def fail_second(path, state):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise reminder.ReminderError("storage failure after send")
            save(path, state)

        with patch.object(reminder, "save_state", side_effect=fail_second), patch.object(reminder.urllib.request, "urlopen", return_value=self.response()) as network:
            with self.assertRaises(reminder.ReminderError):
                self.run_at("2026-10-08T09:00:00")
            self.assertEqual(network.call_count, 1)
        with patch.object(reminder.urllib.request, "urlopen") as network:
            result, _ = self.run_at("2026-10-09T09:00:00")
            self.assertEqual(result["delivery_status"], "uncertain")
            network.assert_not_called()


if __name__ == "__main__":
    unittest.main()

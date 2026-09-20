#!/usr/bin/env python3
"""One fixed renewal notice, every 20 days from 2026-09-18 at 09:00 Beijing."""

import argparse
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.request
import sys


BEIJING = timezone(timedelta(hours=8), "Asia/Shanghai")
BASE = date(2026, 9, 18)
PERIOD = timedelta(days=20)
FIRST_DUE = BASE + PERIOD  # Never backfill the September 18 reminder.
DUE_TIME = time(9, 0)
MESSAGE = "服务器即将到期，请及时续费"
STATE_DEFAULT = "/opt/jinling-mahjong/maintenance/server-renewal-reminder/state/deliveries.json"
STATE_HEADER = {
    "version": 1, "base": BASE.isoformat(), "interval_days": 20,
    "first_due": FIRST_DUE.isoformat(), "time": "09:00",
    "timezone": "Asia/Shanghai", "message": MESSAGE,
}


class ReminderError(Exception):
    """Only fixed, credential-free errors may reach stderr."""


class AlreadyRunning(Exception):
    pass


def now_beijing():
    return datetime.now(BEIJING)


def boundaries(now):
    """Return the latest eligible period and next scheduled boundary.

    Recovery sends at most the most recent period, never a backlog of periods.
    """
    if now.tzinfo is None:
        raise ReminderError("An explicit timezone is required")
    local = now.astimezone(BEIJING)
    periods = (local.date() - FIRST_DUE).days // 20
    candidate = datetime.combine(FIRST_DUE + periods * PERIOD, DUE_TIME, BEIJING)
    if candidate > local:
        candidate -= PERIOD
    latest = candidate if candidate.date() >= FIRST_DUE else None
    next_due = candidate + PERIOD if latest else datetime.combine(FIRST_DUE, DUE_TIME, BEIJING)
    return latest, next_due


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def renewal_chat_id():
    value = os.environ.get("TELEGRAM_RENEWAL_CHAT_ID")
    if not isinstance(value, str) or not re.fullmatch(r"-[1-9][0-9]{0,18}", value):
        raise ReminderError("TELEGRAM_RENEWAL_CHAT_ID must be a negative Telegram group ID")
    if int(value) < -(1 << 63):
        raise ReminderError("TELEGRAM_RENEWAL_CHAT_ID must be a negative Telegram group ID")
    return value


def configured_recipient(path, expected_chat_id):
    if not path:
        raise ReminderError("TELEGRAM_REPORT_CONFIG or --config is required")
    try:
        config = json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (OSError, UnicodeError, ValueError):
        raise ReminderError("Telegram report configuration cannot be read or is invalid") from None
    def normalized_id(value):
        return str(value) if type(value) in (str, int) else None

    if not isinstance(config, dict) or normalized_id(config.get("chatId")) != expected_chat_id:
        raise ReminderError("Telegram recipient does not match the approved report group")
    recipients = []

    def collect(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ("chatId", "chat_id"):
                    recipients.append(child)
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    collect(config)
    if not recipients or any(normalized_id(recipient) != expected_chat_id for recipient in recipients):
        raise ReminderError("Telegram configuration contains inconsistent recipients")
    return normalized_id(config["chatId"])


def read_token(path):
    if not path:
        raise ReminderError("TELEGRAM_BOT_TOKEN_FILE or --token-file is required")
    try:
        token = Path(path).read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError):
        raise ReminderError("Telegram credential file cannot be read") from None
    if not re.fullmatch(r"[0-9]{5,16}:[A-Za-z0-9_-]{20,128}", token):
        raise ReminderError("Telegram credential file is invalid")
    return token


@contextmanager
def state_lock(state_path):
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(str(state_path) + ".lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.fchmod(descriptor, 0o600)
    except OSError:
        raise ReminderError("Cannot create the private reminder lock") from None
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise AlreadyRunning() from None
        yield
    finally:
        os.close(descriptor)


def load_state(path):
    if not path.exists():
        return {**STATE_HEADER, "days": {}}
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, encoding="utf-8") as handle:
            state = json.load(handle, object_pairs_hook=unique_object)
        if not isinstance(state, dict) or any(state.get(key) != value for key, value in STATE_HEADER.items()):
            raise ValueError("Wrong state header")
        if not isinstance(state.get("days"), dict):
            raise ValueError("Invalid entries")
        for day, entry in state["days"].items():
            parsed = date.fromisoformat(day)
            if parsed < FIRST_DUE or (parsed - BASE).days % 20 != 0 or day != parsed.isoformat():
                raise ValueError("Invalid period")
            if not isinstance(entry, dict) or entry.get("status") not in ("sending", "sent", "uncertain", "rejected"):
                raise ValueError("Invalid delivery status")
        return state
    except (OSError, UnicodeError, ValueError, TypeError):
        raise ReminderError("Reminder state is invalid; refusing to risk a duplicate") from None


def save_state(path, state):
    temporary = None
    try:
        descriptor, temporary = tempfile.mkstemp(prefix=".renewal-", suffix=".json", dir=path.parent)
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        temporary = None
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except OSError:
        raise ReminderError("Cannot durably save reminder state; do not retry delivery manually") from None
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except OSError:
                pass


def send_message(token, chat_id):
    request = urllib.request.Request(
        "https://api.telegram.org/bot" + token + "/sendMessage",
        data=json.dumps({"chat_id": chat_id, "text": MESSAGE}).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read(64 * 1024))
        if data.get("ok") is False:
            return {"status": "rejected", "reason": "telegram_rejected"}
        result = data.get("result", {})
        message_id = result.get("message_id")
        if data.get("ok") is not True or type(message_id) is not int or message_id <= 0 or str(result.get("chat", {}).get("id")) != chat_id:
            raise ValueError("Unconfirmed Telegram response")
        return {"status": "sent", "message_id": message_id}
    except Exception:
        # Network exceptions (including HTTPError) often contain the token URL.
        # The outcome may have been accepted by Telegram: never auto-retry it.
        return {"status": "uncertain", "reason": "delivery_not_confirmed"}


def run(args):
    now = now_beijing()
    latest, next_due = boundaries(now)
    if args.check:
        return {
            "base": BASE.isoformat(), "interval_days": 20, "first_due": FIRST_DUE.isoformat(),
            "latest_due": latest.date().isoformat() if latest else None,
            "next_due": next_due.date().isoformat(), "time": "09:00",
            "timezone": "Asia/Shanghai", "message": MESSAGE,
        }, 0
    if latest is None:
        return {"status": "not_due", "next_due": next_due.date().isoformat()}, 0
    due_date = latest.date().isoformat()
    state_path = Path(args.state)
    try:
        with state_lock(state_path):
            state = load_state(state_path)
            # A crash after persisting 'sending' may follow a successful send.
            recovered = False
            for entry in state["days"].values():
                if entry["status"] == "sending":
                    entry.update(status="uncertain", reason="interrupted_delivery")
                    recovered = True
            if recovered:
                save_state(state_path, state)
            existing = state["days"].get(due_date)
            if existing:
                return {"status": "already_recorded", "due_date": due_date, "delivery_status": existing["status"]}, 0
            chat_id = renewal_chat_id()
            chat_id = configured_recipient(args.config, chat_id)
            token = read_token(args.token_file)
            state["days"][due_date] = {"status": "sending", "attempted_at": now.astimezone(BEIJING).isoformat()}
            save_state(state_path, state)  # A durable marker must precede the network request.
            result = send_message(token, chat_id)
            state["days"][due_date].update(result)
            save_state(state_path, state)
            return {"due_date": due_date, **result}, 0 if result["status"] == "sent" else 1
    except AlreadyRunning:
        return {"status": "already_running"}, 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Read-only schedule check; never reads a token or writes state")
    parser.add_argument("--config", default=os.environ.get("TELEGRAM_REPORT_CONFIG"))
    parser.add_argument("--token-file", default=os.environ.get("TELEGRAM_BOT_TOKEN_FILE"))
    parser.add_argument("--state", default=STATE_DEFAULT)
    args = parser.parse_args(argv)
    try:
        result, code = run(args)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        if code:
            print("Renewal reminder delivery needs manual review; automatic resend is disabled", file=sys.stderr)
        return code
    except ReminderError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        # Never expose library exception messages, URLs or credential paths.
        print("Renewal reminder stopped safely; inspect private state before any manual action", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Dependency-free sync service for Russian Key Coach progress data."""

from __future__ import annotations

import argparse
import json
import logging
import math
import shutil
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.parse import urlsplit

RECENT_PER_LETTER = 20
HISTORY_LIMIT = 500
GRAMMAR_HISTORY_LIMIT = 600
GRAMMAR_RECENT_LIMIT = 8
MAX_REQUEST_BYTES = 2 * 1024 * 1024
LETTERS = (
    "\u0430",
    "\u0431",
    "\u0432",
    "\u0433",
    "\u0434",
    "\u0435",
    "\u0451",
    "\u0436",
    "\u0437",
    "\u0438",
    "\u0439",
    "\u043a",
    "\u043b",
    "\u043c",
    "\u043d",
    "\u043e",
    "\u043f",
    "\u0440",
    "\u0441",
    "\u0442",
    "\u0443",
    "\u0444",
    "\u0445",
    "\u0446",
    "\u0447",
    "\u0448",
    "\u0449",
    "\u044a",
    "\u044b",
    "\u044c",
    "\u044d",
    "\u044e",
    "\u044f",
)
LETTER_SET = frozenset(LETTERS)
GRAMMAR_MODULE_IDS = ("first_conjugation", "second_conjugation")
GRAMMAR_STAGE_SEQUENCE = (
    "preview",
    "choose2",
    "choose4",
    "fullChoice",
    "typeFragment",
    "typeFull",
    "sentenceGuided",
    "sentenceFree",
)
GRAMMAR_STAGE_SET = frozenset(GRAMMAR_STAGE_SEQUENCE)
GRAMMAR_PERSON_IDS = ("1sg", "2sg", "3sg", "1pl", "2pl", "3pl")
GRAMMAR_PERSON_SET = frozenset(GRAMMAR_PERSON_IDS)
LOG = logging.getLogger("russian_key_coach_sync")


class ValidationError(ValueError):
    """Raised when an incoming payload is not valid enough to store."""


class ConflictError(RuntimeError):
    """Raised when a client attempts to overwrite a newer saved version."""

    def __init__(self, current_progress: dict[str, Any]):
        super().__init__("Progress has changed on the server.")
        self.current_progress = current_progress


def current_time_ms() -> int:
    return int(time.time() * 1000)


def is_finite_number(value: Any) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(value)
    )


def as_non_negative_int(value: Any, fallback: int) -> int:
    if is_finite_number(value) and value >= 0:
        return int(value)
    return fallback


def parse_non_negative_int(value: Any, fallback: int) -> int:
    if isinstance(value, str):
        try:
            parsed = int(value, 10)
        except ValueError:
            return fallback
        return parsed if parsed >= 0 else fallback
    return as_non_negative_int(value, fallback)


def as_nullable_non_negative_int(value: Any) -> int | None:
    if value is None:
        return None
    if is_finite_number(value) and value >= 0:
        return int(value)
    return None


def create_letter_stats() -> dict[str, Any]:
    return {
        "attempts": 0,
        "totalTimeMs": 0,
        "totalErrors": 0,
        "bestTimeMs": None,
        "lastSeenAt": None,
        "recent": [],
    }


def create_default_keyboard_progress(now_ms: int | None = None) -> dict[str, Any]:
    timestamp = current_time_ms() if now_ms is None else now_ms
    return {
        "version": 1,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "totals": {
            "attempts": 0,
            "totalTimeMs": 0,
            "totalErrors": 0,
            "bestStreak": 0,
        },
        "history": [],
        "letters": {letter: create_letter_stats() for letter in LETTERS},
    }


def create_default_grammar_stage_stats() -> dict[str, Any]:
    return {
        "attempts": 0,
        "totalTimeMs": 0,
        "totalErrors": 0,
        "bestTimeMs": None,
        "lastSeenAt": None,
        "recent": [],
    }


def create_default_grammar_atom_stats() -> dict[str, Any]:
    return {
        "attempts": 0,
        "totalTimeMs": 0,
        "totalErrors": 0,
        "bestTimeMs": None,
        "lastSeenAt": None,
        "recent": [],
        "currentStageId": GRAMMAR_STAGE_SEQUENCE[0],
        "mastered": False,
        "stageStats": {
            stage_id: create_default_grammar_stage_stats()
            for stage_id in GRAMMAR_STAGE_SEQUENCE
        },
    }


def create_default_grammar_subdeck_stats() -> dict[str, Any]:
    return {
        "attempts": 0,
        "totalTimeMs": 0,
        "totalErrors": 0,
        "lastSeenAt": None,
    }


def create_default_grammar_module(module_id: str) -> dict[str, Any]:
    return {
        "moduleId": module_id,
        "selectedSubdeckId": None,
        "selectedPersonId": None,
        "totals": {
            "attempts": 0,
            "totalTimeMs": 0,
            "totalErrors": 0,
            "bestStreak": 0,
        },
        "history": [],
        "sessionStats": {
            "attempts": 0,
            "cleanAttempts": 0,
            "totalTimeMs": 0,
            "totalErrors": 0,
            "bestStreak": 0,
            "updatedAt": None,
        },
        "subdecks": {},
        "atoms": {},
        "lastUsedSettings": {
            "selectedSubdeckId": None,
            "selectedPersonId": None,
            "pinnedAtomId": None,
        },
    }


def create_default_progress(now_ms: int | None = None) -> dict[str, Any]:
    timestamp = current_time_ms() if now_ms is None else now_ms
    return {
        "version": 2,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "keyboard": create_default_keyboard_progress(timestamp),
        "grammarModules": {
            module_id: create_default_grammar_module(module_id)
            for module_id in GRAMMAR_MODULE_IDS
        },
    }


def sanitize_recent(items: Any, now_ms: int) -> list[dict[str, int]]:
    if not isinstance(items, list):
        return []

    sanitized: list[dict[str, int]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        sanitized.append(
            {
                "timeMs": as_non_negative_int(item.get("timeMs"), 0),
                "errors": as_non_negative_int(item.get("errors"), 0),
                "at": as_non_negative_int(item.get("at"), now_ms),
            }
        )
    return sanitized[-RECENT_PER_LETTER:]


def sanitize_history(items: Any, now_ms: int) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []

    sanitized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        letter = item.get("letter")
        if letter not in LETTER_SET:
            continue
        sanitized.append(
            {
                "letter": letter,
                "timeMs": as_non_negative_int(item.get("timeMs"), 0),
                "errors": as_non_negative_int(item.get("errors"), 0),
                "at": as_non_negative_int(item.get("at"), now_ms),
            }
        )
    return sanitized[-HISTORY_LIMIT:]


def sanitize_letter_stats(candidate: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        candidate = {}

    return {
        "attempts": as_non_negative_int(candidate.get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(candidate.get("totalTimeMs"), 0),
        "totalErrors": as_non_negative_int(candidate.get("totalErrors"), 0),
        "bestTimeMs": as_nullable_non_negative_int(candidate.get("bestTimeMs")),
        "lastSeenAt": as_nullable_non_negative_int(candidate.get("lastSeenAt")),
        "recent": sanitize_recent(candidate.get("recent"), now_ms),
    }


def sanitize_keyboard_progress(candidate: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        raise ValidationError("Keyboard progress payload must be a JSON object.")

    totals = candidate.get("totals")
    letters = candidate.get("letters")
    history = candidate.get("history")
    if not isinstance(totals, dict):
        raise ValidationError("Keyboard progress payload must include a totals object.")
    if not isinstance(letters, dict):
        raise ValidationError("Keyboard progress payload must include a letters object.")
    if not isinstance(history, list):
        raise ValidationError("Keyboard progress payload must include a history array.")

    progress = create_default_keyboard_progress(now_ms)
    progress["version"] = max(1, as_non_negative_int(candidate.get("version"), 1))
    progress["createdAt"] = as_non_negative_int(candidate.get("createdAt"), progress["createdAt"])
    progress["updatedAt"] = as_non_negative_int(candidate.get("updatedAt"), progress["updatedAt"])
    progress["totals"] = {
        "attempts": as_non_negative_int(totals.get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(totals.get("totalTimeMs"), 0),
        "totalErrors": as_non_negative_int(totals.get("totalErrors"), 0),
        "bestStreak": as_non_negative_int(totals.get("bestStreak"), 0),
    }
    progress["history"] = sanitize_history(history, now_ms)
    progress["letters"] = {
        letter: sanitize_letter_stats(letters.get(letter), now_ms) for letter in LETTERS
    }
    return progress


def sanitize_grammar_recent(items: Any, now_ms: int) -> list[dict[str, int]]:
    if not isinstance(items, list):
        return []

    sanitized: list[dict[str, int]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        sanitized.append(
            {
                "timeMs": as_non_negative_int(item.get("timeMs"), 0),
                "errors": as_non_negative_int(item.get("errors"), 0),
                "at": as_non_negative_int(item.get("at"), now_ms),
            }
        )
    return sanitized[-GRAMMAR_RECENT_LIMIT:]


def sanitize_grammar_stage_stats(candidate: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        candidate = {}

    return {
        "attempts": as_non_negative_int(candidate.get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(candidate.get("totalTimeMs"), 0),
        "totalErrors": as_non_negative_int(candidate.get("totalErrors"), 0),
        "bestTimeMs": as_nullable_non_negative_int(candidate.get("bestTimeMs")),
        "lastSeenAt": as_nullable_non_negative_int(candidate.get("lastSeenAt")),
        "recent": sanitize_grammar_recent(candidate.get("recent"), now_ms),
    }


def sanitize_grammar_atom_stats(candidate: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        candidate = {}

    atom_stats = create_default_grammar_atom_stats()
    atom_stats["attempts"] = as_non_negative_int(
        candidate.get("attempts", candidate.get("totalAttempts")), 0
    )
    atom_stats["totalTimeMs"] = as_non_negative_int(candidate.get("totalTimeMs"), 0)
    atom_stats["totalErrors"] = as_non_negative_int(candidate.get("totalErrors"), 0)
    atom_stats["bestTimeMs"] = as_nullable_non_negative_int(candidate.get("bestTimeMs"))
    atom_stats["lastSeenAt"] = as_nullable_non_negative_int(candidate.get("lastSeenAt"))
    atom_stats["recent"] = sanitize_grammar_recent(candidate.get("recent"), now_ms)
    current_stage_id = candidate.get("currentStageId")
    if current_stage_id not in GRAMMAR_STAGE_SET:
        current_stage_id = GRAMMAR_STAGE_SEQUENCE[
            min(
                max(as_non_negative_int(candidate.get("currentStageIndex"), 0), 0),
                len(GRAMMAR_STAGE_SEQUENCE) - 1,
            )
        ]
    atom_stats["currentStageId"] = current_stage_id
    atom_stats["mastered"] = bool(candidate.get("mastered", False))
    atom_stats["stageStats"] = {
        stage_id: sanitize_grammar_stage_stats(
            candidate.get("stageStats", {}).get(stage_id), now_ms
        )
        for stage_id in GRAMMAR_STAGE_SEQUENCE
    }
    if atom_stats["mastered"]:
        atom_stats["currentStageId"] = GRAMMAR_STAGE_SEQUENCE[-1]
    return atom_stats


def sanitize_grammar_subdeck_stats(candidate: Any) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        candidate = {}

    return {
        "attempts": as_non_negative_int(candidate.get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(candidate.get("totalTimeMs"), 0),
        "totalErrors": as_non_negative_int(candidate.get("totalErrors"), 0),
        "lastSeenAt": as_nullable_non_negative_int(candidate.get("lastSeenAt")),
    }


def sanitize_grammar_history(items: Any, now_ms: int) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []

    sanitized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        atom_id = item.get("atomId")
        stage_id = item.get("stageId")
        if not isinstance(atom_id, str) or stage_id not in GRAMMAR_STAGE_SET:
            continue
        sanitized.append(
            {
                "atomId": atom_id,
                "stageId": stage_id,
                "timeMs": as_non_negative_int(item.get("timeMs"), 0),
                "errors": as_non_negative_int(item.get("errors"), 0),
                "at": as_non_negative_int(item.get("at"), now_ms),
            }
        )
    return sanitized[-GRAMMAR_HISTORY_LIMIT:]


def sanitize_grammar_module(module_id: str, candidate: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        candidate = {}

    module_state = create_default_grammar_module(module_id)
    module_state["selectedSubdeckId"] = (
        candidate.get("selectedSubdeckId")
        if isinstance(candidate.get("selectedSubdeckId"), str)
        else None
    )
    module_state["selectedPersonId"] = (
        candidate.get("selectedPersonId")
        if candidate.get("selectedPersonId") in GRAMMAR_PERSON_SET
        else None
    )
    module_state["totals"] = {
        "attempts": as_non_negative_int(candidate.get("totals", {}).get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(
            candidate.get("totals", {}).get("totalTimeMs"), 0
        ),
        "totalErrors": as_non_negative_int(
            candidate.get("totals", {}).get("totalErrors"), 0
        ),
        "bestStreak": as_non_negative_int(
            candidate.get("totals", {}).get("bestStreak"), 0
        ),
    }
    module_state["history"] = sanitize_grammar_history(candidate.get("history"), now_ms)
    module_state["sessionStats"] = {
        "attempts": as_non_negative_int(
            candidate.get("sessionStats", {}).get("attempts"), 0
        ),
        "cleanAttempts": as_non_negative_int(
            candidate.get("sessionStats", {}).get(
                "cleanAttempts", candidate.get("sessionStats", {}).get("cleanHits")
            ),
            0,
        ),
        "totalTimeMs": as_non_negative_int(
            candidate.get("sessionStats", {}).get("totalTimeMs"), 0
        ),
        "totalErrors": as_non_negative_int(
            candidate.get("sessionStats", {}).get("totalErrors"), 0
        ),
        "bestStreak": as_non_negative_int(
            candidate.get("sessionStats", {}).get("bestStreak"), 0
        ),
        "updatedAt": as_nullable_non_negative_int(
            candidate.get("sessionStats", {}).get(
                "updatedAt", candidate.get("sessionStats", {}).get("endedAt")
            )
        ),
    }

    raw_subdecks = candidate.get("subdecks")
    if isinstance(raw_subdecks, dict):
        module_state["subdecks"] = {
            subdeck_id: sanitize_grammar_subdeck_stats(subdeck_candidate)
            for subdeck_id, subdeck_candidate in raw_subdecks.items()
            if isinstance(subdeck_id, str)
        }

    raw_atoms = candidate.get("atoms", candidate.get("atomStats"))
    if isinstance(raw_atoms, dict):
        module_state["atoms"] = {
            atom_id: sanitize_grammar_atom_stats(atom_candidate, now_ms)
            for atom_id, atom_candidate in raw_atoms.items()
            if isinstance(atom_id, str)
        }

    last_used = candidate.get("lastUsedSettings")
    if isinstance(last_used, dict):
        module_state["lastUsedSettings"] = {
            "selectedSubdeckId": (
                last_used.get("selectedSubdeckId")
                if isinstance(last_used.get("selectedSubdeckId"), str)
                else module_state["selectedSubdeckId"]
            ),
            "selectedPersonId": (
                last_used.get("selectedPersonId")
                if last_used.get("selectedPersonId") in GRAMMAR_PERSON_SET
                else module_state["selectedPersonId"]
            ),
            "pinnedAtomId": (
                last_used.get("pinnedAtomId")
                if isinstance(last_used.get("pinnedAtomId"), str)
                else None
            ),
        }
    else:
        module_state["lastUsedSettings"]["selectedSubdeckId"] = module_state[
            "selectedSubdeckId"
        ]
        module_state["lastUsedSettings"]["selectedPersonId"] = module_state[
            "selectedPersonId"
        ]

    return module_state


def sanitize_progress(
    candidate: Any,
    now_ms: int | None = None,
    *,
    preserve_created_at: int | None = None,
    refresh_updated_at: bool = True,
) -> dict[str, Any]:
    timestamp = current_time_ms() if now_ms is None else now_ms
    if not isinstance(candidate, dict):
        raise ValidationError("Progress payload must be a JSON object.")

    progress = create_default_progress(timestamp)
    progress["createdAt"] = as_non_negative_int(
        candidate.get("createdAt"),
        preserve_created_at if preserve_created_at is not None else progress["createdAt"],
    )
    progress["updatedAt"] = (
        timestamp
        if refresh_updated_at
        else as_non_negative_int(candidate.get("updatedAt"), progress["updatedAt"])
    )

    looks_like_v2 = isinstance(candidate.get("keyboard"), dict) and isinstance(
        candidate.get("grammarModules"), dict
    )
    looks_like_v1 = (
        isinstance(candidate.get("totals"), dict)
        and isinstance(candidate.get("letters"), dict)
        and isinstance(candidate.get("history"), list)
    )

    if looks_like_v2:
        progress["version"] = max(2, as_non_negative_int(candidate.get("version"), 2))
        progress["keyboard"] = sanitize_keyboard_progress(candidate.get("keyboard"), timestamp)
        progress["grammarModules"] = {
            module_id: sanitize_grammar_module(
                module_id, candidate.get("grammarModules", {}).get(module_id), timestamp
            )
            for module_id in GRAMMAR_MODULE_IDS
        }
        return progress

    if looks_like_v1:
        progress["version"] = 2
        progress["keyboard"] = sanitize_keyboard_progress(candidate, timestamp)
        progress["grammarModules"] = {
            module_id: sanitize_grammar_module(module_id, None, timestamp)
            for module_id in GRAMMAR_MODULE_IDS
        }
        return progress

    raise ValidationError(
        "Progress payload must be either the legacy keyboard shape or the version 2 multi-module shape."
    )

    return progress


class ProgressStore:
    """Manages the canonical progress file and backup rotation."""

    def __init__(self, data_dir: str | Path):
        self.data_dir = Path(data_dir)
        self.progress_path = self.data_dir / "progress.json"
        self.backups_dir = self.data_dir / "backups"
        self.lock = threading.Lock()

    def ensure_layout(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.backups_dir.mkdir(parents=True, exist_ok=True)

    def load(self) -> dict[str, Any]:
        with self.lock:
            self.ensure_layout()
            if not self.progress_path.exists():
                progress = create_default_progress()
                self._write(progress, create_backup=False)
                return progress
            return self._read_current()

    def replace(
        self,
        candidate: Any,
        *,
        expected_updated_at: int | None = None,
    ) -> dict[str, Any]:
        with self.lock:
            self.ensure_layout()
            existing_created_at = None
            current_progress: dict[str, Any] | None = None
            if self.progress_path.exists():
                current_progress = self._read_current()
                existing_created_at = current_progress.get("createdAt")
                if (
                    expected_updated_at is not None
                    and expected_updated_at != current_progress.get("updatedAt")
                ):
                    raise ConflictError(current_progress)
            replacement_timestamp = current_time_ms()
            if current_progress is not None:
                replacement_timestamp = max(
                    replacement_timestamp,
                    as_non_negative_int(current_progress.get("updatedAt"), 0) + 1,
                )
            progress = sanitize_progress(
                candidate,
                now_ms=replacement_timestamp,
                preserve_created_at=existing_created_at,
                refresh_updated_at=True,
            )
            self._write(progress, create_backup=self.progress_path.exists())
            return progress

    def seed(self, source_path: str | Path) -> dict[str, Any]:
        source = Path(source_path)
        payload = json.loads(source.read_text(encoding="utf-8"))
        return self.replace(payload)

    def get_health(self) -> dict[str, Any]:
        progress_exists = self.progress_path.exists()
        updated_at = None
        if progress_exists:
            try:
                updated_at = self._read_current().get("updatedAt")
            except Exception:  # pragma: no cover - health still reports path state.
                updated_at = None

        return {
            "status": "ok",
            "progressExists": progress_exists,
            "progressPath": str(self.progress_path),
            "backupPath": str(self.backups_dir),
            "updatedAt": updated_at,
        }

    def _read_current(self) -> dict[str, Any]:
        payload = json.loads(self.progress_path.read_text(encoding="utf-8"))
        return sanitize_progress(payload, current_time_ms(), refresh_updated_at=False)

    def _write(self, progress: dict[str, Any], create_backup: bool) -> None:
        if create_backup and self.progress_path.exists():
            self._backup_current_file()

        payload = json.dumps(
            progress,
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        )
        with NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=self.data_dir,
            prefix="progress.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(payload)
            handle.write("\n")
            handle.flush()
            handle_file = handle.fileno()
            handle_name = handle.name
            try:
                import os

                os.fsync(handle_file)
            except OSError:
                LOG.warning("fsync failed for temporary progress file %s", handle_name)

        Path(handle_name).replace(self.progress_path)

    def _backup_current_file(self) -> None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        destination = self.backups_dir / f"progress-{timestamp}.json"
        shutil.copy2(self.progress_path, destination)


class ProgressRequestHandler(BaseHTTPRequestHandler):
    """HTTP API for progress sync."""

    server_version = "RussianKeyCoachSync/1.0"

    def do_GET(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path
        if path == "/progress":
            self._handle_get_progress()
            return
        if path == "/health":
            self._write_json(HTTPStatus.OK, self.server.store.get_health())
            return
        self._write_error(HTTPStatus.NOT_FOUND, "Not found.")

    def do_PUT(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path
        if path != "/progress":
            self._write_error(HTTPStatus.NOT_FOUND, "Not found.")
            return

        try:
            payload = self._read_json_body()
            progress = self.server.store.replace(
                payload,
                expected_updated_at=self._read_expected_updated_at(),
            )
        except ConflictError as exc:
            self._write_json(HTTPStatus.CONFLICT, exc.current_progress)
            return
        except ValidationError as exc:
            self._write_error(HTTPStatus.BAD_REQUEST, str(exc))
            return
        except json.JSONDecodeError:
            self._write_error(HTTPStatus.BAD_REQUEST, "Request body must be valid JSON.")
            return
        except OSError as exc:
            LOG.exception("Failed to write progress store.")
            self._write_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                f"Failed to persist progress: {exc}",
            )
            return

        self._write_json(HTTPStatus.OK, progress)

    def log_message(self, format_string: str, *args: Any) -> None:
        LOG.info("%s - %s", self.address_string(), format_string % args)

    def _handle_get_progress(self) -> None:
        try:
            progress = self.server.store.load()
        except OSError as exc:
            LOG.exception("Failed to load progress store.")
            self._write_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                f"Failed to load progress: {exc}",
            )
            return
        self._write_json(HTTPStatus.OK, progress)

    def _read_json_body(self) -> Any:
        content_length_header = self.headers.get("Content-Length")
        if content_length_header is None:
            raise ValidationError("Content-Length header is required.")

        content_length = parse_non_negative_int(content_length_header, -1)
        if content_length < 0:
            raise ValidationError("Content-Length header must be a non-negative integer.")
        if content_length > MAX_REQUEST_BYTES:
            raise ValidationError("Request body is too large.")

        body = self.rfile.read(content_length)
        return json.loads(body.decode("utf-8"))

    def _read_expected_updated_at(self) -> int | None:
        header = self.headers.get("X-Expected-Updated-At")
        if header is None:
            return None

        parsed = parse_non_negative_int(header, -1)
        if parsed < 0:
            raise ValidationError(
                "X-Expected-Updated-At must be a non-negative integer."
            )
        return parsed

    def _write_json(self, status: HTTPStatus, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode(
            "utf-8"
        )
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _write_error(self, status: HTTPStatus, message: str) -> None:
        self._write_json(status, {"error": message, "status": status.value})


class ProgressHTTPServer(ThreadingHTTPServer):
    """Typed server that exposes the backing store to request handlers."""

    def __init__(self, server_address: tuple[str, int], store: ProgressStore):
        self.store = store
        super().__init__(server_address, ProgressRequestHandler)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Russian Key Coach progress sync service."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve_parser = subparsers.add_parser(
        "serve",
        help="Run the HTTP sync service.",
    )
    add_runtime_arguments(serve_parser)

    seed_parser = subparsers.add_parser(
        "seed",
        help="Load a local export JSON file into the server-side progress store.",
    )
    add_store_argument(seed_parser)
    seed_parser.add_argument(
        "--source",
        required=True,
        help="Path to an exported progress JSON file.",
    )

    return parser


def add_runtime_arguments(parser: argparse.ArgumentParser) -> None:
    add_store_argument(parser)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host interface to bind. Default: 127.0.0.1",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8786,
        help="TCP port to bind. Default: 8786",
    )


def add_store_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--data-dir",
        default="/var/lib/russian-key-coach",
        help="Directory for progress.json and timestamped backups.",
    )


def serve(args: argparse.Namespace) -> int:
    store = ProgressStore(args.data_dir)
    store.ensure_layout()
    server = ProgressHTTPServer((args.host, args.port), store)
    LOG.info(
        "Serving Russian Key Coach sync API on http://%s:%s with data dir %s",
        args.host,
        args.port,
        args.data_dir,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOG.info("Shutdown requested.")
    finally:
        server.server_close()
    return 0


def seed(args: argparse.Namespace) -> int:
    store = ProgressStore(args.data_dir)
    progress = store.seed(args.source)
    print(
        json.dumps(
            {
                "status": "ok",
                "progressPath": str(store.progress_path),
                "attempts": progress["totals"]["attempts"],
                "updatedAt": progress["updatedAt"],
            },
            ensure_ascii=True,
        )
    )
    return 0


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "serve":
        return serve(args)
    if args.command == "seed":
        return seed(args)
    parser.error("Unknown command.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

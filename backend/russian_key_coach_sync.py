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


def create_totals() -> dict[str, int]:
    return {
        "attempts": 0,
        "totalTimeMs": 0,
        "totalErrors": 0,
        "bestStreak": 0,
    }


def create_default_keyboard_module(now_ms: int | None = None) -> dict[str, Any]:
    timestamp = current_time_ms() if now_ms is None else now_ms
    return {
        "version": 1,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "totals": create_totals(),
        "history": [],
        "letters": {letter: create_letter_stats() for letter in LETTERS},
        "resume": {
            "currentLetter": None,
            "previousLetters": [],
        },
    }


def create_default_mixed_review() -> dict[str, Any]:
    return {
        "mode": "before_class",
        "queue": [],
        "currentIndex": 0,
        "pendingPrompt": None,
        "totals": create_totals(),
    }


def create_default_progress(now_ms: int | None = None) -> dict[str, Any]:
    timestamp = current_time_ms() if now_ms is None else now_ms
    return {
        "version": 2,
        "curriculumVersion": "",
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "navigation": {
            "lastRoute": "home",
            "lastModuleId": "keyboard",
            "lastSubdeckId": None,
            "lastStageId": None,
            "mixedReviewMode": "before_class",
        },
        "preferences": {
            "speakerGender": "fem",
        },
        "modules": {
            "keyboard": create_default_keyboard_module(timestamp),
        },
        "mixedReview": create_default_mixed_review(),
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


def sanitize_totals(candidate: Any) -> dict[str, int]:
    if not isinstance(candidate, dict):
        candidate = {}

    return {
        "attempts": as_non_negative_int(candidate.get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(candidate.get("totalTimeMs"), 0),
        "totalErrors": as_non_negative_int(candidate.get("totalErrors"), 0),
        "bestStreak": as_non_negative_int(candidate.get("bestStreak"), 0),
    }


def sanitize_keyboard_history(items: Any, now_ms: int) -> list[dict[str, Any]]:
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


def sanitize_module_history(items: Any, now_ms: int) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []

    sanitized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        atom_id = item.get("atomId")
        if not isinstance(atom_id, str) or not atom_id:
            continue
        sanitized.append(
            {
                "atomId": atom_id,
                "timeMs": as_non_negative_int(item.get("timeMs"), 0),
                "errors": as_non_negative_int(item.get("errors"), 0),
                "at": as_non_negative_int(item.get("at"), now_ms),
                "stageId": item.get("stageId") if isinstance(item.get("stageId"), str) else None,
            }
        )
    return sanitized[-HISTORY_LIMIT:]


def sanitize_prompt(candidate: Any) -> dict[str, Any] | None:
    if not isinstance(candidate, dict):
        return None

    atom_id = candidate.get("atomId")
    if not isinstance(atom_id, str) or not atom_id:
        return None

    def sanitize_prompt_entry(entry: Any) -> Any:
        if isinstance(entry, dict):
            sanitized = {}
            if isinstance(entry.get("value"), str):
                sanitized["value"] = entry["value"]
            if isinstance(entry.get("label"), str):
                sanitized["label"] = entry["label"]
            return sanitized if sanitized else None
        if isinstance(entry, str):
            return entry
        return None

    options = [
        item
        for item in (sanitize_prompt_entry(entry) for entry in candidate.get("options", []))
        if item is not None
    ][:24]
    sequence = [
        item
        for item in (sanitize_prompt_entry(entry) for entry in candidate.get("sequence", []))
        if item is not None
    ][:24]

    return {
        "atomId": atom_id,
        "stageId": candidate.get("stageId") if isinstance(candidate.get("stageId"), str) else None,
        "stageProfileId": (
            candidate.get("stageProfileId")
            if isinstance(candidate.get("stageProfileId"), str)
            else None
        ),
        "promptType": (
            candidate.get("promptType")
            if isinstance(candidate.get("promptType"), str)
            else None
        ),
        "contextId": (
            candidate.get("contextId") if isinstance(candidate.get("contextId"), str) else None
        ),
        "subdeckId": (
            candidate.get("subdeckId") if isinstance(candidate.get("subdeckId"), str) else None
        ),
        "lineIndex": (
            as_non_negative_int(candidate.get("lineIndex"), 0)
            if candidate.get("lineIndex") is not None
            else None
        ),
        "options": options,
        "sequence": sequence,
    }


def sanitize_stage_stats(candidate: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        candidate = {}

    return {
        "attempts": as_non_negative_int(candidate.get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(candidate.get("totalTimeMs"), 0),
        "totalErrors": as_non_negative_int(candidate.get("totalErrors"), 0),
        "recent": sanitize_recent(candidate.get("recent"), now_ms),
    }


def sanitize_atom_progress(candidate: Any, now_ms: int) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        candidate = {}

    stage_stats = candidate.get("stageStats")
    sanitized_stage_stats: dict[str, Any] = {}
    if isinstance(stage_stats, dict):
        for stage_id, stage_candidate in stage_stats.items():
            if not isinstance(stage_id, str) or not stage_id:
                continue
            sanitized_stage_stats[stage_id] = sanitize_stage_stats(stage_candidate, now_ms)

    return {
        "attempts": as_non_negative_int(candidate.get("attempts"), 0),
        "totalTimeMs": as_non_negative_int(candidate.get("totalTimeMs"), 0),
        "totalErrors": as_non_negative_int(candidate.get("totalErrors"), 0),
        "bestTimeMs": as_nullable_non_negative_int(candidate.get("bestTimeMs")),
        "lastSeenAt": as_nullable_non_negative_int(candidate.get("lastSeenAt")),
        "seen": bool(candidate.get("seen")),
        "currentStageIndex": as_non_negative_int(candidate.get("currentStageIndex"), 0),
        "recent": sanitize_recent(candidate.get("recent"), now_ms),
        "stageStats": sanitized_stage_stats,
    }


def sanitize_keyboard_module(candidate: Any, now_ms: int) -> dict[str, Any]:
    source = candidate if isinstance(candidate, dict) else {}
    resume = source.get("resume") if isinstance(source.get("resume"), dict) else {}
    letters = source.get("letters") if isinstance(source.get("letters"), dict) else {}
    base = create_default_keyboard_module(now_ms)
    base["version"] = max(1, as_non_negative_int(source.get("version"), 1))
    base["createdAt"] = as_non_negative_int(source.get("createdAt"), base["createdAt"])
    base["updatedAt"] = as_non_negative_int(source.get("updatedAt"), base["updatedAt"])
    base["totals"] = sanitize_totals(source.get("totals"))
    base["history"] = sanitize_keyboard_history(source.get("history"), now_ms)
    base["resume"] = {
        "currentLetter": (
            resume.get("currentLetter")
            if isinstance(resume.get("currentLetter"), str)
            and resume.get("currentLetter") in LETTER_SET
            else None
        ),
        "previousLetters": [
            letter
            for letter in resume.get("previousLetters", [])
            if isinstance(letter, str) and letter in LETTER_SET
        ][:3],
    }
    for letter in LETTERS:
        base["letters"][letter] = sanitize_letter_stats(
            letters.get(letter),
            now_ms,
        )
    return base


def sanitize_generic_module(candidate: Any, now_ms: int) -> dict[str, Any]:
    source = candidate if isinstance(candidate, dict) else {}
    atoms = source.get("atoms")
    sanitized_atoms: dict[str, Any] = {}
    if isinstance(atoms, dict):
        for atom_id, atom_candidate in atoms.items():
            if not isinstance(atom_id, str) or not atom_id:
                continue
            sanitized_atoms[atom_id] = sanitize_atom_progress(atom_candidate, now_ms)

    return {
        "selectedSubdeckId": (
            source.get("selectedSubdeckId")
            if isinstance(source.get("selectedSubdeckId"), str)
            else None
        ),
        "hiddenEnabled": [
            item
            for item in source.get("hiddenEnabled", [])
            if isinstance(item, str) and item
        ][:24],
        "pendingPrompt": sanitize_prompt(source.get("pendingPrompt")),
        "totals": sanitize_totals(source.get("totals")),
        "history": sanitize_module_history(source.get("history"), now_ms),
        "atoms": sanitized_atoms,
    }


def sanitize_mixed_review(candidate: Any, now_ms: int) -> dict[str, Any]:
    source = candidate if isinstance(candidate, dict) else {}
    queue = []
    if isinstance(source.get("queue"), list):
        for item in source["queue"]:
            if not isinstance(item, dict):
                continue
            module_id = item.get("moduleId")
            atom_id = item.get("atomId")
            if not isinstance(module_id, str) or not isinstance(atom_id, str):
                continue
            queue.append(
                {
                    "moduleId": module_id,
                    "atomId": atom_id,
                    "stageId": item.get("stageId") if isinstance(item.get("stageId"), str) else None,
                }
            )

    return {
        "mode": source.get("mode") if isinstance(source.get("mode"), str) else "before_class",
        "queue": queue[:40],
        "currentIndex": as_non_negative_int(source.get("currentIndex"), 0),
        "pendingPrompt": sanitize_prompt(source.get("pendingPrompt")),
        "totals": sanitize_totals(source.get("totals")),
    }


def looks_like_legacy_progress(candidate: Any) -> bool:
    return isinstance(candidate, dict) and "letters" in candidate and "totals" in candidate


def sanitize_legacy_progress(
    candidate: Any,
    now_ms: int,
    *,
    preserve_created_at: int | None = None,
    refresh_updated_at: bool,
) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        raise ValidationError("Progress payload must be a JSON object.")

    totals = candidate.get("totals")
    letters = candidate.get("letters")
    history = candidate.get("history")
    if not isinstance(totals, dict):
        raise ValidationError("Legacy progress payload must include a totals object.")
    if not isinstance(letters, dict):
        raise ValidationError("Legacy progress payload must include a letters object.")
    if not isinstance(history, list):
        raise ValidationError("Legacy progress payload must include a history array.")

    progress = create_default_progress(now_ms)
    progress["version"] = max(2, as_non_negative_int(candidate.get("version"), 2))
    progress["createdAt"] = as_non_negative_int(
        candidate.get("createdAt"),
        preserve_created_at if preserve_created_at is not None else progress["createdAt"],
    )
    progress["updatedAt"] = (
        now_ms
        if refresh_updated_at
        else as_non_negative_int(candidate.get("updatedAt"), progress["updatedAt"])
    )
    progress["navigation"]["lastRoute"] = "keyboard"
    progress["navigation"]["lastModuleId"] = "keyboard"
    progress["modules"]["keyboard"] = sanitize_keyboard_module(candidate, now_ms)
    return progress


def sanitize_multimodule_progress(
    candidate: Any,
    now_ms: int,
    *,
    preserve_created_at: int | None = None,
    refresh_updated_at: bool,
) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        raise ValidationError("Progress payload must be a JSON object.")

    modules = candidate.get("modules")
    if not isinstance(modules, dict):
        raise ValidationError("Progress payload must include a modules object.")

    progress = create_default_progress(now_ms)
    progress["version"] = max(2, as_non_negative_int(candidate.get("version"), 2))
    progress["curriculumVersion"] = (
        candidate.get("curriculumVersion")
        if isinstance(candidate.get("curriculumVersion"), str)
        else ""
    )
    navigation = (
        candidate.get("navigation") if isinstance(candidate.get("navigation"), dict) else {}
    )
    preferences = (
        candidate.get("preferences")
        if isinstance(candidate.get("preferences"), dict)
        else {}
    )
    progress["createdAt"] = as_non_negative_int(
        candidate.get("createdAt"),
        preserve_created_at if preserve_created_at is not None else progress["createdAt"],
    )
    progress["updatedAt"] = (
        now_ms
        if refresh_updated_at
        else as_non_negative_int(candidate.get("updatedAt"), progress["updatedAt"])
    )
    progress["navigation"] = {
        "lastRoute": navigation.get("lastRoute") if isinstance(navigation.get("lastRoute"), str) else "home",
        "lastModuleId": (
            navigation.get("lastModuleId") if isinstance(navigation.get("lastModuleId"), str) else "keyboard"
        ),
        "lastSubdeckId": (
            navigation.get("lastSubdeckId")
            if isinstance(navigation.get("lastSubdeckId"), str)
            else None
        ),
        "lastStageId": (
            navigation.get("lastStageId")
            if isinstance(navigation.get("lastStageId"), str)
            else None
        ),
        "mixedReviewMode": (
            navigation.get("mixedReviewMode")
            if isinstance(navigation.get("mixedReviewMode"), str)
            else "before_class"
        ),
    }
    progress["preferences"] = {
        "speakerGender": ("masc" if preferences.get("speakerGender") == "masc" else "fem")
    }

    sanitized_modules: dict[str, Any] = {}
    for module_id, module_candidate in modules.items():
        if not isinstance(module_id, str) or not module_id:
            continue
        if module_id == "keyboard":
            sanitized_modules[module_id] = sanitize_keyboard_module(module_candidate, now_ms)
        else:
            sanitized_modules[module_id] = sanitize_generic_module(module_candidate, now_ms)
    if "keyboard" not in sanitized_modules:
        sanitized_modules["keyboard"] = create_default_keyboard_module(now_ms)
    progress["modules"] = sanitized_modules
    progress["mixedReview"] = sanitize_mixed_review(candidate.get("mixedReview"), now_ms)
    return progress


def sanitize_progress(
    candidate: Any,
    now_ms: int | None = None,
    *,
    preserve_created_at: int | None = None,
    refresh_updated_at: bool = True,
) -> dict[str, Any]:
    timestamp = current_time_ms() if now_ms is None else now_ms
    if looks_like_legacy_progress(candidate) and not isinstance(candidate.get("modules"), dict):
        return sanitize_legacy_progress(
            candidate,
            timestamp,
            preserve_created_at=preserve_created_at,
            refresh_updated_at=refresh_updated_at,
        )

    return sanitize_multimodule_progress(
        candidate,
        timestamp,
        preserve_created_at=preserve_created_at,
        refresh_updated_at=refresh_updated_at,
    )


def total_attempts(progress: dict[str, Any]) -> int:
    if isinstance(progress.get("totals"), dict):
        return as_non_negative_int(progress["totals"].get("attempts"), 0)

    modules = progress.get("modules")
    if not isinstance(modules, dict):
        return 0

    return sum(
        as_non_negative_int(module.get("totals", {}).get("attempts"), 0)
        for module in modules.values()
        if isinstance(module, dict)
    )


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
            next_timestamp = current_time_ms()
            if self.progress_path.exists():
                current_progress = self._read_current()
                existing_created_at = current_progress.get("createdAt")
                next_timestamp = max(
                    next_timestamp,
                    as_non_negative_int(current_progress.get("updatedAt"), 0) + 1,
                )
                if (
                    expected_updated_at is not None
                    and expected_updated_at != current_progress.get("updatedAt")
                ):
                    raise ConflictError(current_progress)
            progress = sanitize_progress(
                candidate,
                now_ms=next_timestamp,
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
                "attempts": total_attempts(progress),
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

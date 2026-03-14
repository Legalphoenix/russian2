import json
import tempfile
import unittest
from pathlib import Path

from backend.russian_key_coach_sync import (
    ConflictError,
    LETTERS,
    ProgressStore,
    ValidationError,
)


class ProgressStoreTests(unittest.TestCase):
    def test_load_creates_default_progress_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()

            self.assertEqual(progress["totals"]["attempts"], 0)
            self.assertEqual(sorted(progress["letters"].keys()), sorted(LETTERS))
            self.assertTrue((Path(tmp) / "progress.json").exists())

    def test_replace_creates_backup_of_previous_progress(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()
            progress["totals"]["attempts"] = 3
            store.replace(progress)

            backups = list((Path(tmp) / "backups").glob("*.json"))
            self.assertEqual(len(backups), 1)
            stored = json.loads((Path(tmp) / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["totals"]["attempts"], 3)

    def test_replace_rejects_invalid_top_level_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            with self.assertRaises(ValidationError):
                store.replace({"history": [], "letters": {}})

    def test_replace_rejects_stale_updated_at(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            baseline = store.load()
            expected_updated_at = baseline["updatedAt"]

            first = json.loads(json.dumps(baseline))
            first["totals"]["attempts"] = 1
            saved = store.replace(first, expected_updated_at=expected_updated_at)

            stale = json.loads(json.dumps(baseline))
            stale["totals"]["attempts"] = 2
            with self.assertRaises(ConflictError):
                store.replace(stale, expected_updated_at=expected_updated_at)

            current = json.loads((Path(tmp) / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(current["updatedAt"], saved["updatedAt"])
            self.assertEqual(current["totals"]["attempts"], 1)


if __name__ == "__main__":
    unittest.main()

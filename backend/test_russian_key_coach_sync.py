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
    def test_load_creates_default_multimodule_progress_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()

            self.assertIn("modules", progress)
            self.assertIn("keyboard", progress["modules"])
            self.assertEqual(
                sorted(progress["modules"]["keyboard"]["letters"].keys()),
                sorted(LETTERS),
            )
            self.assertEqual(progress["navigation"]["lastRoute"], "home")
            self.assertTrue((Path(tmp) / "progress.json").exists())

    def test_replace_creates_backup_of_previous_progress(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()
            progress["modules"]["keyboard"]["totals"]["attempts"] = 3
            store.replace(progress)

            backups = list((Path(tmp) / "backups").glob("*.json"))
            self.assertEqual(len(backups), 1)
            stored = json.loads((Path(tmp) / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["modules"]["keyboard"]["totals"]["attempts"], 3)

    def test_replace_rejects_invalid_top_level_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            with self.assertRaises(ValidationError):
                store.replace([])

    def test_replace_rejects_stale_updated_at(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            baseline = store.load()
            expected_updated_at = baseline["updatedAt"]

            first = json.loads(json.dumps(baseline))
            first["modules"]["keyboard"]["totals"]["attempts"] = 1
            saved = store.replace(first, expected_updated_at=expected_updated_at)

            stale = json.loads(json.dumps(baseline))
            stale["modules"]["keyboard"]["totals"]["attempts"] = 2
            with self.assertRaises(ConflictError):
                store.replace(stale, expected_updated_at=expected_updated_at)

            current = json.loads((Path(tmp) / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(current["updatedAt"], saved["updatedAt"])
            self.assertEqual(current["modules"]["keyboard"]["totals"]["attempts"], 1)

    def test_legacy_keyboard_payload_migrates_to_module_namespace(self) -> None:
        legacy_payload = {
            "version": 1,
            "createdAt": 100,
            "updatedAt": 100,
            "totals": {
                "attempts": 4,
                "totalTimeMs": 4000,
                "totalErrors": 3,
                "bestStreak": 2,
            },
            "history": [{"letter": "ж", "timeMs": 800, "errors": 1, "at": 100}],
            "letters": {
                letter: {
                    "attempts": 0,
                    "totalTimeMs": 0,
                    "totalErrors": 0,
                    "bestTimeMs": None,
                    "lastSeenAt": None,
                    "recent": [],
                }
                for letter in LETTERS
            },
        }
        legacy_payload["letters"]["ж"]["attempts"] = 4

        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            saved = store.replace(legacy_payload)

            self.assertIn("modules", saved)
            self.assertEqual(saved["navigation"]["lastRoute"], "keyboard")
            self.assertEqual(saved["modules"]["keyboard"]["totals"]["attempts"], 4)
            self.assertEqual(saved["modules"]["keyboard"]["letters"]["ж"]["attempts"], 4)

    def test_replace_accepts_multimodule_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()
            progress["curriculumVersion"] = "2026-03-14-curated-v1"
            progress["modules"]["first_conjugation"] = {
                "selectedSubdeckId": "fc_regular_core",
                "hiddenEnabled": [],
                "pendingPrompt": {
                    "atomId": "fc_regular_core__rabotat__1sg",
                    "stageId": "choose2",
                    "stageProfileId": "grammar_full",
                    "promptType": "choice",
                    "contextId": "fc_sent_work_mon",
                    "subdeckId": "fc_regular_core",
                    "lineIndex": None,
                    "options": [
                        {"value": "работаю", "label": "работаю"},
                        {"value": "работаем", "label": "работаем"},
                    ],
                    "sequence": [],
                },
                "totals": {
                    "attempts": 2,
                    "totalTimeMs": 1800,
                    "totalErrors": 1,
                    "bestStreak": 1,
                },
                "history": [
                    {
                        "atomId": "fc_regular_core__rabotat__1sg",
                        "timeMs": 900,
                        "errors": 1,
                        "at": 100,
                        "stageId": "choose2",
                    }
                ],
                "atoms": {
                    "fc_regular_core__rabotat__1sg": {
                        "attempts": 2,
                        "totalTimeMs": 1800,
                        "totalErrors": 1,
                        "bestTimeMs": 700,
                        "lastSeenAt": 100,
                        "seen": True,
                        "currentStageIndex": 2,
                        "recent": [
                            {
                                "timeMs": 900,
                                "errors": 1,
                                "at": 100,
                                "stageId": "choose2",
                            }
                        ],
                        "stageStats": {
                            "choose2": {
                                "attempts": 2,
                                "totalTimeMs": 1800,
                                "totalErrors": 1,
                                "recent": [
                                    {
                                        "timeMs": 900,
                                        "errors": 1,
                                        "at": 100,
                                        "stageId": "choose2",
                                    }
                                ],
                            }
                        },
                    }
                },
            }

            saved = store.replace(progress)
            self.assertEqual(saved["curriculumVersion"], "2026-03-14-curated-v1")
            self.assertIn("first_conjugation", saved["modules"])
            self.assertEqual(saved["modules"]["first_conjugation"]["totals"]["attempts"], 2)


if __name__ == "__main__":
    unittest.main()

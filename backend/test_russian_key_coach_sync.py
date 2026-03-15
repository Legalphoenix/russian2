import json
import tempfile
import unittest
from pathlib import Path

from backend.russian_key_coach_sync import (
    ConflictError,
    GRAMMAR_MODULE_IDS,
    LETTERS,
    ProgressStore,
    ValidationError,
)


class ProgressStoreTests(unittest.TestCase):
    def test_load_creates_default_progress_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()

            self.assertEqual(progress["version"], 2)
            self.assertEqual(progress["keyboard"]["totals"]["attempts"], 0)
            self.assertEqual(sorted(progress["keyboard"]["letters"].keys()), sorted(LETTERS))
            self.assertEqual(
                sorted(progress["grammarModules"].keys()),
                sorted(GRAMMAR_MODULE_IDS),
            )
            self.assertTrue((Path(tmp) / "progress.json").exists())

    def test_replace_creates_backup_of_previous_progress(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()
            progress["keyboard"]["totals"]["attempts"] = 3
            store.replace(progress)

            backups = list((Path(tmp) / "backups").glob("*.json"))
            self.assertEqual(len(backups), 1)
            stored = json.loads((Path(tmp) / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(stored["keyboard"]["totals"]["attempts"], 3)

    def test_replace_rejects_invalid_top_level_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            with self.assertRaises(ValidationError):
                store.replace({"history": [], "letters": {}})

    def test_load_upgrades_existing_v1_progress_to_v2_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            legacy = {
                "version": 1,
                "createdAt": 100,
                "updatedAt": 200,
                "totals": {
                    "attempts": 4,
                    "totalTimeMs": 2000,
                    "totalErrors": 3,
                    "bestStreak": 2,
                },
                "history": [
                    {
                        "letter": "ж",
                        "timeMs": 500,
                        "errors": 1,
                        "at": 150,
                    }
                ],
                "letters": {letter: {} for letter in LETTERS},
            }
            (Path(tmp) / "progress.json").write_text(
                json.dumps(legacy),
                encoding="utf-8",
            )

            store = ProgressStore(tmp)
            progress = store.load()

            self.assertEqual(progress["version"], 2)
            self.assertEqual(progress["keyboard"]["totals"]["attempts"], 4)
            self.assertEqual(progress["grammarModules"]["first_conjugation"]["moduleId"], "first_conjugation")
            self.assertEqual(progress["grammarModules"]["second_conjugation"]["moduleId"], "second_conjugation")

    def test_replace_accepts_legacy_v1_payload_and_wraps_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            store.load()

            legacy = {
                "version": 1,
                "createdAt": 100,
                "updatedAt": 200,
                "totals": {
                    "attempts": 7,
                    "totalTimeMs": 3200,
                    "totalErrors": 4,
                    "bestStreak": 3,
                },
                "history": [],
                "letters": {letter: {} for letter in LETTERS},
            }

            saved = store.replace(legacy)

            self.assertEqual(saved["version"], 2)
            self.assertEqual(saved["keyboard"]["totals"]["attempts"], 7)
            self.assertEqual(
                sorted(saved["grammarModules"].keys()),
                sorted(GRAMMAR_MODULE_IDS),
            )

    def test_replace_preserves_frontend_grammar_module_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            progress = store.load()

            progress["grammarModules"]["first_conjugation"] = {
                "moduleId": "first_conjugation",
                "selectedSubdeckId": "fc_regular_core",
                "selectedPersonId": "1sg",
                "totals": {
                    "attempts": 9,
                    "totalTimeMs": 12345,
                    "totalErrors": 4,
                    "bestStreak": 5,
                },
                "history": [
                    {
                        "atomId": "first_conjugation__fc_regular_core__rabotat__1sg",
                        "stageId": "typeFull",
                        "timeMs": 2100,
                        "errors": 1,
                        "at": 500,
                    }
                ],
                "sessionStats": {
                    "attempts": 3,
                    "cleanAttempts": 2,
                    "totalTimeMs": 6000,
                    "totalErrors": 1,
                    "bestStreak": 2,
                    "updatedAt": 450,
                },
                "subdecks": {
                    "fc_regular_core": {
                        "attempts": 9,
                        "totalTimeMs": 12345,
                        "totalErrors": 4,
                        "lastSeenAt": 400,
                    }
                },
                "atoms": {
                    "first_conjugation__fc_regular_core__rabotat__1sg": {
                        "attempts": 4,
                        "totalTimeMs": 5000,
                        "totalErrors": 2,
                        "bestTimeMs": 1000,
                        "lastSeenAt": 401,
                        "recent": [
                            {
                                "timeMs": 1200,
                                "errors": 0,
                                "at": 390,
                            }
                        ],
                        "currentStageId": "typeFull",
                        "mastered": False,
                        "stageStats": {
                            "preview": {"attempts": 2},
                            "typeFull": {
                                "attempts": 2,
                                "totalTimeMs": 2400,
                                "totalErrors": 1,
                                "bestTimeMs": 1000,
                                "lastSeenAt": 401,
                                "recent": [
                                    {
                                        "timeMs": 1200,
                                        "errors": 0,
                                        "at": 390,
                                    }
                                ],
                            },
                        },
                    }
                },
                "lastUsedSettings": {
                    "selectedSubdeckId": "fc_regular_core",
                    "selectedPersonId": "1sg",
                    "pinnedAtomId": "first_conjugation__fc_regular_core__rabotat__1sg",
                },
            }

            saved = store.replace(progress)
            module = saved["grammarModules"]["first_conjugation"]

            self.assertEqual(module["selectedSubdeckId"], "fc_regular_core")
            self.assertEqual(module["selectedPersonId"], "1sg")
            self.assertEqual(module["sessionStats"]["cleanAttempts"], 2)
            self.assertIn("fc_regular_core", module["subdecks"])
            self.assertIn(
                "first_conjugation__fc_regular_core__rabotat__1sg",
                module["atoms"],
            )
            self.assertEqual(
                module["atoms"]["first_conjugation__fc_regular_core__rabotat__1sg"][
                    "currentStageId"
                ],
                "typeFull",
            )
            self.assertEqual(
                module["lastUsedSettings"]["pinnedAtomId"],
                "first_conjugation__fc_regular_core__rabotat__1sg",
            )

    def test_replace_rejects_stale_updated_at(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(tmp)
            baseline = store.load()
            expected_updated_at = baseline["updatedAt"]

            first = json.loads(json.dumps(baseline))
            first["keyboard"]["totals"]["attempts"] = 1
            saved = store.replace(first, expected_updated_at=expected_updated_at)

            stale = json.loads(json.dumps(baseline))
            stale["keyboard"]["totals"]["attempts"] = 2
            with self.assertRaises(ConflictError):
                store.replace(stale, expected_updated_at=expected_updated_at)

            current = json.loads((Path(tmp) / "progress.json").read_text(encoding="utf-8"))
            self.assertEqual(current["updatedAt"], saved["updatedAt"])
            self.assertEqual(current["keyboard"]["totals"]["attempts"], 1)


if __name__ == "__main__":
    unittest.main()

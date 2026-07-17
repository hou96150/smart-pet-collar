import unittest

from pet_collar.events import create_event


class RecognitionEventTests(unittest.TestCase):
    def test_event_matches_shared_contract(self):
        event = create_event(
            emotion="fearful_aggressive",
            confidence=0.86,
            risk_level="high",
            source="simulation",
        ).to_dict()

        self.assertEqual(
            set(event),
            {"id", "timestamp", "emotion", "confidence", "riskLevel", "source", "audioFile"},
        )
        self.assertEqual(event["source"], "simulation")
        self.assertIsNone(event["audioFile"])

    def test_rejects_unknown_emotion(self):
        with self.assertRaisesRegex(ValueError, "不支援的情緒類別"):
            create_event(
                emotion="excited",
                confidence=0.5,
                risk_level="low",
                source="simulation",
            )

    def test_rejects_invalid_confidence(self):
        with self.assertRaisesRegex(ValueError, "confidence"):
            create_event(
                emotion="happy",
                confidence=1.1,
                risk_level="low",
                source="simulation",
            )


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

from pet_collar.inference import ModelUnavailableError, SimulationInferencer, TensorFlowModel


class InferenceTests(unittest.TestCase):
    def test_simulation_is_explicitly_marked(self):
        inferencer = SimulationInferencer()
        self.assertEqual(inferencer.source, "simulation")
        self.assertEqual(
            inferencer.predict(emotion="happy", confidence=0.9),
            ("happy", 0.9),
        )

    def test_missing_model_is_not_treated_as_real_inference(self):
        missing = Path(tempfile.gettempdir()) / "pet-collar-missing-model.keras"
        with self.assertRaisesRegex(ModelUnavailableError, "找不到模型"):
            TensorFlowModel(missing)


if __name__ == "__main__":
    unittest.main()

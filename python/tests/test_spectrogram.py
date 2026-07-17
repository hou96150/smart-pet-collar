import tempfile
import unittest
from pathlib import Path

from pet_collar.spectrogram import generate_spectrogram


class SpectrogramTests(unittest.TestCase):
    def test_missing_audio_is_reported_before_optional_imports(self):
        missing = Path(tempfile.gettempdir()) / "pet-collar-missing-audio.wav"
        output = Path(tempfile.gettempdir()) / "pet-collar-spectrum.png"

        with self.assertRaisesRegex(FileNotFoundError, "找不到音訊檔"):
            generate_spectrogram(missing, output)


if __name__ == "__main__":
    unittest.main()

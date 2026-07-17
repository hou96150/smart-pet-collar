import unittest

from pet_collar.hardware import (
    AudioLevelTrigger,
    SafeMockBuzzer,
    SafeMockRecorder,
    TriggerAction,
)


class HardwareTests(unittest.TestCase):
    def test_trigger_starts_and_stops_after_sustained_silence(self):
        trigger = AudioLevelTrigger(threshold=10, silence_samples_to_stop=2)

        self.assertEqual(trigger.update(2), TriggerAction.NONE)
        self.assertEqual(trigger.update(12), TriggerAction.START_RECORDING)
        self.assertEqual(trigger.update(4), TriggerAction.NONE)
        self.assertEqual(trigger.update(3), TriggerAction.STOP_RECORDING)

    def test_loud_sample_resets_silence_counter(self):
        trigger = AudioLevelTrigger(threshold=10, silence_samples_to_stop=2)
        trigger.update(12)
        trigger.update(2)
        trigger.update(11)

        self.assertEqual(trigger.update(2), TriggerAction.NONE)

    def test_trigger_can_start_again_after_stopping(self):
        trigger = AudioLevelTrigger(threshold=10, silence_samples_to_stop=1)
        trigger.update(12)
        trigger.update(2)

        self.assertEqual(trigger.update(11), TriggerAction.START_RECORDING)

    def test_safe_mocks_do_not_need_gpio_or_microphone(self):
        recorder = SafeMockRecorder("sample.wav")
        buzzer = SafeMockBuzzer()

        recorder.start()
        self.assertEqual(recorder.stop(), "sample.wav")
        buzzer.alert()
        self.assertEqual(buzzer.alert_count, 1)


if __name__ == "__main__":
    unittest.main()

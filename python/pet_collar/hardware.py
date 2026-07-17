"""錄音觸發與蜂鳴器的硬體無關介面及安全 mock。"""

from dataclasses import dataclass
from enum import Enum
from typing import Protocol


class TriggerAction(str, Enum):
    """音量狀態機回傳給錄音控制層的動作。"""

    NONE = "none"
    START_RECORDING = "start_recording"
    STOP_RECORDING = "stop_recording"


@dataclass
class AudioLevelTrigger:
    """只判斷何時開始／停止錄音，不直接操作麥克風。

    ``update`` 應由音訊取樣迴圈持續呼叫。開始錄音後，必須連續收到
    ``silence_samples_to_stop`` 次低於門檻的音量才停止，避免狗叫短暫停頓
    就把同一段聲音切成數個檔案。
    """

    threshold: float
    silence_samples_to_stop: int = 3
    is_recording: bool = False
    _silent_samples: int = 0

    def update(self, level: float) -> TriggerAction:
        """接收一筆音量值並回傳本次需要執行的錄音動作。"""

        if not self.is_recording:
            if level >= self.threshold:
                self.is_recording = True
                self._silent_samples = 0
                return TriggerAction.START_RECORDING
            return TriggerAction.NONE

        if level >= self.threshold:
            self._silent_samples = 0
            return TriggerAction.NONE

        self._silent_samples += 1
        if self._silent_samples >= self.silence_samples_to_stop:
            self.is_recording = False
            self._silent_samples = 0
            return TriggerAction.STOP_RECORDING
        return TriggerAction.NONE


class Recorder(Protocol):
    """錄音器契約；日後可用 USB 麥克風實作取代安全 mock。"""

    def start(self) -> None: ...
    def stop(self) -> str: ...


class Buzzer(Protocol):
    """蜂鳴器契約；真實 GPIO 實作只需提供 ``alert``。"""

    def alert(self) -> None: ...


class SafeMockRecorder:
    """開發環境用錄音器，不讀取麥克風或產生真實音訊檔。"""

    def __init__(self, output_file: str = "mock-recording.wav"):
        self.output_file = output_file
        self.is_recording = False

    def start(self) -> None:
        self.is_recording = True

    def stop(self) -> str:
        if not self.is_recording:
            raise RuntimeError("mock 錄音尚未開始")
        self.is_recording = False
        return self.output_file


class SafeMockBuzzer:
    """開發環境用蜂鳴器，不存取 GPIO，也不發出聲音。

    ``alert_count`` 讓 Windows 測試可以驗證警告是否被觸發；部署到
    Raspberry Pi 時，應注入符合 ``Buzzer`` 契約的 RPi.GPIO 實作。
    """

    def __init__(self):
        self.alert_count = 0

    def alert(self) -> None:
        self.alert_count += 1

"""辨識事件資料契約。"""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4


EMOTIONS = (
    "happy",
    "angry",
    "fearful",
    "sad",
    "fearful_aggressive",
    "unknown",
)
RISK_LEVELS = ("low", "medium", "high")
SOURCES = ("simulation", "model")


@dataclass(frozen=True)
class RecognitionEvent:
    """跨 Python、Node.js 與網頁共用的辨識事件。

    欄位名稱刻意沿用前端契約的 camelCase（``riskLevel``、
    ``audioFile``），請勿只在 Python 端改成 snake_case，否則後端與
    即時監控頁會讀不到資料。
    """

    id: str
    timestamp: str
    emotion: str
    confidence: float
    riskLevel: str
    source: str
    audioFile: Optional[str]

    def to_dict(self) -> dict:
        """轉成可直接序列化為共用 JSON 契約的字典。"""

        return asdict(self)


def create_event(
    *,
    emotion: str,
    confidence: float,
    risk_level: str,
    source: str,
    audio_file: Optional[str] = None,
) -> RecognitionEvent:
    """驗證欄位並建立一筆符合第一版共用契約的辨識事件。

    ``source`` 只允許 ``simulation`` 或 ``model``，讓展示事件與真實模型
    結果可以被清楚區分。風險等級若由網站後端判定，應使用後端回傳的
    完整事件，不要在 Python 端自行覆寫。
    """

    if emotion not in EMOTIONS:
        raise ValueError(f"不支援的情緒類別：{emotion}")
    if not 0.0 <= confidence <= 1.0:
        raise ValueError("confidence 必須介於 0 與 1 之間")
    if risk_level not in RISK_LEVELS:
        raise ValueError(f"不支援的風險等級：{risk_level}")
    if source not in SOURCES:
        raise ValueError(f"不支援的事件來源：{source}")

    return RecognitionEvent(
        id=str(uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        emotion=emotion,
        confidence=confidence,
        riskLevel=risk_level,
        source=source,
        audioFile=audio_file,
    )

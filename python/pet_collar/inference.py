"""模擬推論與可選的 TensorFlow 模型載入介面。"""

from pathlib import Path
from typing import Any


class ModelUnavailableError(RuntimeError):
    """真實模型或執行環境不可用。"""


class SimulationInferencer:
    """明確由呼叫端指定結果的展示推論器。

    這個類別不會讀取音訊或計算模型準確率，只用來打通展示資料流。
    ``source`` 必須維持為 ``simulation``，避免前端把測試結果誤認為
    真實 CNN 推論。
    """

    source = "simulation"

    def predict(self, *, emotion: str, confidence: float) -> tuple[str, float]:
        return emotion, confidence


class TensorFlowModel:
    """TensorFlow 模型的薄封裝，不負責猜測模型輸入前處理。

    日後接入訓練完成的 CNN 時，以這個類別取代 ``SimulationInferencer``。
    呼叫端仍需先把頻譜轉成模型訓練時相同的尺寸、色彩通道與數值範圍，
    再將張量傳給 ``predict``；這裡刻意不內建未知的前處理假設。
    """

    source = "model"

    def __init__(self, model_path: str | Path):
        path = Path(model_path)
        if not path.exists():
            raise ModelUnavailableError(f"找不到模型：{path}")

        try:
            from tensorflow.keras.models import load_model
        except ImportError as exc:
            raise ModelUnavailableError(
                "尚未安裝 TensorFlow，無法載入真實模型。"
            ) from exc

        try:
            self._model = load_model(path)
        except Exception as exc:
            raise ModelUnavailableError(f"模型載入失敗：{path}") from exc

    def predict(self, inputs: Any) -> Any:
        """轉交 TensorFlow 推論；類別索引與信心值由呼叫端解析。"""

        return self._model.predict(inputs)

"""使用可選依賴 librosa 產生 Mel 頻譜圖。"""

from pathlib import Path


class SpectrogramDependencyError(RuntimeError):
    """頻譜功能所需的選用套件尚未安裝。"""


def generate_spectrogram(audio_path: str | Path, output_path: str | Path) -> Path:
    """將音訊轉為 Mel 頻譜 PNG，並回傳輸出路徑。

    目前保留音訊原始取樣率，轉成單聲道後直接產生 Mel 頻譜，沒有降噪、
    音量正規化或固定時長裁切。未來重新訓練模型時，訓練與 Raspberry Pi
    推論必須共用完全相同的前處理參數，否則產生的圖片雖然相似，模型輸入
    分布仍可能不同。
    """
    source = Path(audio_path)
    destination = Path(output_path)
    if not source.is_file():
        raise FileNotFoundError(f"找不到音訊檔：{source}")

    try:
        import librosa
        import librosa.display
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise SpectrogramDependencyError(
            "產生頻譜圖需要 librosa 與 matplotlib；"
            "請安裝 python/requirements-audio.txt。"
        ) from exc

    # sr=None 保留來源取樣率；mono=True 將不同錄音裝置統一為單聲道。
    samples, sample_rate = librosa.load(source, sr=None, mono=True)
    mel = librosa.feature.melspectrogram(y=samples, sr=sample_rate)
    # 對數分貝尺度更接近頻譜圖常見呈現，也壓縮極端能量值的差距。
    decibels = librosa.power_to_db(mel, ref=mel.max)

    destination.parent.mkdir(parents=True, exist_ok=True)
    figure, axis = plt.subplots()
    librosa.display.specshow(
        decibels,
        sr=sample_rate,
        x_axis="time",
        y_axis="mel",
        ax=axis,
    )
    axis.set_axis_off()
    figure.savefig(destination, bbox_inches="tight", pad_inches=0)
    plt.close(figure)
    return destination

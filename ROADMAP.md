# 智慧寵物項圈｜下一階段研究路線

最後更新：2026-07-18

## 研究結論

下一版不建議立刻重建 7～10 個主觀的「單一情緒＋組合情緒」分類器。第一個真正可驗證的模型應先預測：

- `arousal`：低／中／高喚醒度。
- `valence`：負向／中性／正向。
- `unknown`：音訊品質不足、不是狗叫、多人或多犬重疊，或無法可靠判定。

網站再將模型輸出、連續視窗投票與規則轉換成低／中／高風險。原本的 `happy`、`angry`、`fearful`、`sad`、`fearful_aggressive` 可以暫時保留為展示與舊資料相容層，但不能把聲音單獨判定的結果描述成犬隻內在情緒或攻擊意圖的確診。

## 為什麼先改標註方式

EmotionalCanines 以喚醒度與正負向描述犬隻發聲，包含 1,400 段、約 35 分鐘的 Husky 與 Shiba Inu 犬吠資料。該研究也明確指出，人類從影片推測犬隻情緒仍存在主觀與擬人化偏誤。因此，第一個正式模型應把目標縮小成可重複標註的行為訊號，再由系統做風險提示，而不是直接宣稱知道狗的精確情緒。

## Dataset v2

每段音訊至少保存以下欄位：

```text
sample_id
dog_id
source_video_id
source_type
license
recording_environment
microphone
breed
vocalization_type
context
arousal
valence
label_confidence
annotator_id
is_ambiguous
audio_path
```

資料規則：

1. 保留 `unknown／ambiguous`，不強迫每段音訊進入情緒類別。
2. 訓練、驗證與測試必須依 `dog_id` 及 `source_video_id` 分組；同一隻狗或同一支影片不能跨資料集。
3. 自行錄音應作為獨立現場測試集，不能只混入網路資料後隨機切分。
4. 常見類別過多時採 class weights 或 balanced sampling，不再直接用原始數量訓練。
5. 保存來源與授權紀錄；研究資料若為非商用授權，未來商業化前必須重新確認。

## Audio pipeline v2

- 統一轉為 `16 kHz`、mono。
- 比較 `1 秒` 與 `2 秒` 視窗，先採 `50% overlap`。
- 直接輸入 log-Mel 數值 tensor，不先輸出 PNG 再讀回模型。
- 起始基準可使用 `64 mel bins`，所有參數寫入版本化設定檔。
- 模型於程式啟動時載入一次，之後持續等待錄音。
- 錄音狀態機加入約 `300 ms` pre-roll、開始／停止不同門檻、最大錄音長度與 cooldown。
- 先做 DC 去除、低頻限制及以訓練集統計量標準化；不要一開始使用會抹掉 growl 或音量線索的強降噪。
- 訓練資料加入背景噪音混合、gain、time shift、輕微 time／frequency masking，並加入純背景負例。

## Model v2

第一個基準模型：

```text
log-Mel tensor
    → 小型 CNN／depthwise CNN
    → arousal head
    → valence head
    → unknown／non-dog gate
    → 連續視窗投票
    → 低／中／高風險
```

高風險候選可先定義為 `negative + high arousal`，但至少需要連續 `2／3` 個視窗成立才發出警告，避免單次短叫造成誤報。正式評估至少回報：

- macro-F1。
- 每類 recall。
- confusion matrix。
- 高風險 recall。
- false alerts per hour。
- p50／p95 推論延遲。

## 裝置與部署

1. 先用 Raspberry Pi 4 建立正確性與效能基準。
2. 再部署到 Raspberry Pi Zero 2 W，製作桌上型或胸背固定的便攜 MVP。
3. 先輸出 float32 LiteRT 基準，再做全整數 INT8 post-training quantization。
4. 量化校正樣本必須涵蓋安靜、近距、遠距、人聲、車聲及不同麥克風。
5. 若量化後 macro-F1 或高風險 recall 明顯下降，再評估 quantization-aware training。
6. Pi 裝置只安裝輕量推論 runtime，避免完整 TensorFlow 佔用資源。

Raspberry Pi Zero 2 W 的官方規格為 `65 × 30 mm`、`1 GHz` 四核心 Cortex-A53、`512 MB` RAM、單一 USB OTG 與 `5 V／2.5 A` 供電。它比 Pi 4 適合便攜原型，但仍須實測 USB 麥克風、供電、溫度、續航與固定方式。早期應固定在胸背或桌上測試，不建議直接長時間掛在狗的頸部。

ESP32-S3 與 I2S 麥克風列為後續微型化選項。應先在 Zero 2 W 固定模型、前處理與閾值，再考慮移植到微控制器，避免同時處理模型研究與底層硬體限制。

## Monitor v2

現有 SSE 已足以處理單向即時監控，下一版暫時不需要改成 WebSocket。事件契約建議增加：

```json
{
  "modelVersion": "v2.0.0",
  "inferenceMs": 184,
  "audioQuality": "good",
  "deviceStatus": "online",
  "windowVotes": ["negative_high", "negative_high", "unknown"]
}
```

介面應增加「正在收音」、「分析中」、「音訊品質不足」及「裝置離線」狀態。網路中斷時，裝置在本機排隊保存事件，恢復連線後再補送。高風險紅色提醒維持有限次脈衝，不採無限閃爍。

## 建議執行順序

### Sprint 1｜資料契約與可重現基準

- 建立 Dataset v2 欄位與授權紀錄。
- 取得並檢查 EmotionalCanines。
- 建立依狗與影片分組的 split 程式。
- 固定 log-Mel 參數與資料品質檢查。

### Sprint 2｜第一個真實模型

- 建立小型 CNN 雙輸出模型。
- 產生 float32 基準報告。
- 加入 pure-background 與 non-dog 測試。
- 將自己的錄音作為完全獨立測試集。

### Sprint 3｜即時推論與風險投票

- 串接真實音訊觸發。
- 加入三視窗投票與時間平滑。
- 將模型版本、推論時間及音訊品質寫入事件。
- 保留模擬模式供展示與回歸測試。

### Sprint 4｜邊緣裝置驗證

- 在 Pi 4 與 Zero 2 W 測量 p50／p95 延遲、峰值 RAM、溫度與耗電。
- 比較 float32 與 INT8 的模型大小、延遲及高風險 recall。
- 建立胸背固定原型並記錄重量、晃動、續航與溫度。

## 第一個完成門檻

- 測試集中沒有同一隻狗或同一來源影片洩漏。
- 每 `500 ms` 可處理一個新視窗，端到端警示目標不超過約 `2 秒`。
- 長時間執行沒有持續記憶體成長。
- 報告 macro-F1、各類 recall、混淆矩陣與每小時誤報次數。
- 模擬事件與真實模型事件在網站上有清楚標示。
- 硬體原型不直接以頸部長時間佩戴進行早期測試。

## 主要風險

- 影片標註是人類對情境與行為的推測，不是犬隻內在狀態真值。
- EmotionalCanines 目前只有兩個品種，跨品種泛化能力有限。
- 網路影片存在壓縮、背景音與 domain shift。
- 音訊無法可靠判斷聲音來自佩戴犬或旁邊另一隻狗。
- 強降噪、音量正規化與 INT8 量化都可能降低高風險召回率，必須逐項比較。
- 重量、盒子晃動、電池、溫度及防潮屬於動物安全問題，不能只看模型準確率。

## 研究來源

- [EmotionalCanines 論文](https://kenzhu2000.github.io/papers/acmmm25-dogemo.pdf)
- [EmotionalCanines 資料集](https://github.com/tmdang1101/EmotionalCanines)
- [DogSpeak 論文](https://kenzhu2000.github.io/papers/acmmm25-dogspeak.pdf)
- [DogSpeak 資料卡](https://huggingface.co/datasets/shibin4/DogSpeak_Dataset)
- [Raspberry Pi Zero 2 W 官方 Product Brief](https://datasheets.raspberrypi.com/rpizero2/raspberry-pi-zero-2-w-product-brief.pdf)
- [Raspberry Pi 4 官方規格](https://www.raspberrypi.com/products/raspberry-pi-4-model-b/specifications/)
- [LiteRT post-training quantization](https://developers.google.com/edge/litert/conversion/tensorflow/quantization/post_training_quantization)
- [TensorFlow 音訊辨識教學](https://www.tensorflow.org/tutorials/audio/simple_audio)
- [librosa Mel spectrogram API](https://librosa.org/doc/latest/generated/librosa.feature.melspectrogram.html)
- [ESP32-S3 官方文件](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/get-started/index.html)

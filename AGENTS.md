# 智慧寵物項圈協作規則

## 統整中樞

目前的 Codex 任務「智慧寵物項圈｜統整中樞」是唯一指令入口。使用者在中樞下達命令後，由統整者判斷應交給哪個分工，並在整合前確認介面契約與測試結果。

## 分工

### AI／音訊

- 擁有範圍：`python/`。
- 負責錄音觸發、靜音停止、頻譜產生、模型介面、模擬推論與訓練骨架。
- 不直接修改 `server/` 或 `public/`。

### 後端／資料

- 擁有範圍：`server/`、`data/`、後端測試及根目錄 `package.json`。
- 負責狀態 API、風險規則、歷史紀錄、即時事件與靜態檔案服務。
- 不直接修改 `python/` 或 `public/`。

### 前端／介面

- 擁有範圍：`public/`、`tokens.css`、`.hallmark/`。
- 負責手機優先監控介面、情緒狀態、風險警告、歷史紀錄與測試操作。
- 不直接修改後端與 Python 邏輯。

### 統整／驗證

- 擁有範圍：`PROJECT_STATUS.md`、`README.md`、跨模組契約與端到端驗證。
- 每個分工有成果、阻礙或介面變更時，更新 `PROJECT_STATUS.md`。
- 不將模擬結果描述為真實 AI 準確率。

## 第一版共用資料契約

辨識事件至少包含：

```json
{
  "id": "event-id",
  "timestamp": "ISO-8601",
  "emotion": "fearful_aggressive",
  "confidence": 0.86,
  "riskLevel": "high",
  "source": "simulation",
  "audioFile": null
}
```

初始情緒類別只採用已確認內容：`happy`、`angry`、`fearful`、`sad`、`fearful_aggressive`、`unknown`。

## 完成條件

- 預錄音訊或模擬事件可通過完整資料流。
- 網站會立即顯示最新情緒、信心與風險。
- 高風險事件會顯示警告，蜂鳴器在非 Raspberry Pi 環境以安全模擬取代。
- 歷史紀錄可持久保存。
- Windows 開發環境不需要 GPIO 或 TensorFlow 也能啟動展示。
- 所有自動化測試通過後才能宣告第一版完成。

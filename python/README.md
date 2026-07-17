# AI／音訊模組

此模組在未安裝 GPIO、TensorFlow 或音訊套件的 Windows 環境中，仍可執行模擬展示與測試。

## 模擬事件

在 `python/` 目錄執行：

```powershell
python -m pet_collar --emotion fearful_aggressive --confidence 0.86 --risk-level high
```

輸出的 `source` 永遠是 `simulation`，不代表真實 AI 辨識結果。

若後端已啟動，可省略 `--risk-level`，將模擬結果送到後端：

```powershell
python -m pet_collar --emotion fearful_aggressive --confidence 0.86 --server-url http://127.0.0.1:3000
```

CLI 會將資料送到後端的 `/api/events`。畫面輸出以後端回傳事件為準，事件識別碼、時間與風險等級皆由後端產生。此功能只使用 Python 標準函式庫。
`http://127.0.0.1` 與 `http://localhost` 後端連線會明確略過環境代理，並且只建立 HTTP handler，不會初始化 TLS／HTTPS handler。當後端回傳或離線產生的事件為 `high` 風險時，CLI 會呼叫蜂鳴器介面；開發環境預設使用 `SafeMockBuzzer`，只記錄觸發次數，不會真正發聲或存取 GPIO。

## 測試

```powershell
python -m unittest discover -s tests -v
```

## 選用功能

產生頻譜圖前，安裝 `requirements-audio.txt`。載入真實 TensorFlow 模型前，安裝 `requirements-model.txt` 並提供實際存在的模型檔。缺少依賴或模型時，程式會明確報錯，不會自動退回假辨識。

`TensorFlowModel` 只處理模型載入與 `predict` 呼叫。實際圖片尺寸、正規化方式與標籤順序必須等新模型規格確認後再加入，避免猜測舊模型行為。

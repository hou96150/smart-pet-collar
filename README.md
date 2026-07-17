# 智慧寵物項圈／Smart Pet Collar

[繁體中文](#繁體中文)｜[English](#english)

## 繁體中文

2025 年國立虎尾科技大學資訊工程系畢業專題的第一版重建系統。此版本先恢復可驗證的完整資料流，保留日後替換真實 TensorFlow 模型、Raspberry Pi 錄音與 GPIO 蜂鳴器的介面。

## 目前進度

第一版即時監控資料流已完成，Node.js 後端測試 `6／6`、Python 測試 `16／16` 通過。網站已在 `320／375／414／768 px` 實際驗證，瀏覽器主控台為 `0` 錯誤、`0` 警告。目前使用模擬事件驗證完整流程，尚未重建原始狗叫聲資料集與正式模型。

## 第一版可以做什麼

- 在手機或電腦瀏覽器即時查看狗狗情緒、模型信心與風險等級。
- 透過網頁或 Python CLI 產生明確標示的模擬事件。
- 將事件持久保存為 JSONL 歷史紀錄。
- 透過 SSE 將新事件立即推送到網站。
- 高風險事件顯示警告視窗，並讓即時監控卡進行約 2.4 秒的有限次紅色脈衝提醒。
- 在 Windows 使用安全 mock 驗證錄音觸發與蜂鳴器流程，不需要 GPIO 或 TensorFlow。
- 選擇性安裝 `librosa` 產生 Mel 頻譜圖，或載入日後重新訓練的 TensorFlow 模型。

模擬事件只用來驗證系統流程，不代表真實 AI 判斷結果，也不能當成模型準確率證明。

## 快速啟動

需求：Node.js 18 以上版本。

```powershell
npm.cmd start
```

電腦瀏覽器開啟：

```text
http://127.0.0.1:3000
```

手機與 Raspberry Pi 或電腦連接同一個 Wi-Fi 後，使用主機的區域網路 IP：

```text
http://<區域網路 IP>:3000
```

網站內的「測試工具」可直接建立模擬事件。

## 從 Python 送出模擬事件

在另一個 PowerShell 視窗執行：

```powershell
Set-Location python
python -m pet_collar --emotion fearful_aggressive --confidence 0.86 --server-url http://127.0.0.1:3000
```

後端會統一產生事件 ID、時間與風險等級，網站則透過 SSE 立即更新。

## 執行測試

後端：

```powershell
npm.cmd test
```

AI／音訊：

```powershell
Set-Location python
python -m unittest discover -s tests -v
```

## 專案結構

```text
public/        手機優先即時監控介面
server/        Node.js API、SSE 與靜態網站服務
python/        音訊、頻譜、推論介面、硬體 mock 與 CLI
data/          最新狀態、歷史事件與風險規則
AGENTS.md      統整中樞與各分工的協作規則
PROJECT_STATUS.md  第一版統整進度與問題紀錄
```

## 第一版風險規則

`data/risk-rules.json` 內的門檻是重建版暫定測試值，不是舊專題留下的原始門檻。可透過 API 或直接調整設定檔更新，正式版本應在新資料集與模型驗證後重新校正。

## 選用 AI／音訊依賴

- `python/requirements-audio.txt`：產生 Mel 頻譜圖。
- `python/requirements-model.txt`：載入真實 TensorFlow 模型。

缺少選用依賴或模型檔案時，程式會明確失敗，不會把隨機結果偽裝成真實辨識。

## 已知限制

- 原始音訊資料集、完整 7～10 類標註規格、訓練程式與模型權重已遺失，必須重新建立。
- 目前情緒輸出是模擬事件，不能宣稱為真實 AI 辨識準確率。
- 風險門檻是串接測試值，不是經研究驗證的安全標準。
- Raspberry Pi、USB 麥克風、實體蜂鳴器、電池續航、重量與晃動仍須重新進行硬體驗證。
- 目前只支援區域網路監控，尚未提供雲端帳號與遠端通知。

## 後續版本

完整研究依據、資料契約與分階段開發順序請見 [ROADMAP.md](ROADMAP.md)。

- 重新蒐集、標註並平衡狗叫聲資料集。
- 完成音訊降噪、音量正規化與資料增強。
- 正式訓練、評估及部署 TensorFlow 模型。
- 接回 Raspberry Pi 收音與 GPIO 蜂鳴器。
- 加入 LINE、Email 或簡訊通知。
- 加入 GPS、心率、體溫與活動量感測器。
- 建立雲端部署、帳號與多寵物管理。

---

## English

This repository rebuilds the first version of a 2025 graduation project from the Department of Computer Science and Information Engineering at National Formosa University. The current version restores a verifiable end-to-end data flow while keeping replaceable interfaces for a future TensorFlow model, Raspberry Pi audio capture, and a GPIO buzzer.

## Current progress

The first real-time monitoring data flow is complete. All `6/6` Node.js backend tests and `16/16` Python tests pass. The website has been verified at `320/375/414/768 px` with `0` browser console errors and `0` warnings. The current flow uses explicitly labelled simulation events; the original dog-vocalization dataset and trained model have not yet been rebuilt.

## First-version features

- View the current dog emotion, model confidence, and risk level in a phone or desktop browser.
- Generate explicitly labelled simulation events from the website or Python CLI.
- Persist recognition events in JSONL history.
- Push new events to the website immediately through Server-Sent Events.
- Show a warning dialog for high-risk events and pulse the live monitoring card red for a finite period of about 2.4 seconds.
- Validate the recording trigger and buzzer flow on Windows with safe mocks, without requiring GPIO or TensorFlow.
- Optionally install `librosa` to generate Mel spectrograms or load a future retrained TensorFlow model.

Simulation events validate the system flow only. They are not real AI predictions and must not be presented as model-accuracy evidence.

## Quick start

Requirement: Node.js 18 or later.

```powershell
npm.cmd start
```

Open the following address on the host computer:

```text
http://127.0.0.1:3000
```

When the phone and Raspberry Pi or computer are connected to the same Wi-Fi network, open the host's local IP address:

```text
http://<local-network-ip>:3000
```

Use the website's test tools to create a simulation event.

## Send a simulation event from Python

Run the following commands in another PowerShell window:

```powershell
Set-Location python
python -m pet_collar --emotion fearful_aggressive --confidence 0.86 --server-url http://127.0.0.1:3000
```

The backend assigns the event ID, timestamp, and risk level. The website receives the update through Server-Sent Events.

## Run tests

Backend:

```powershell
npm.cmd test
```

AI and audio modules:

```powershell
Set-Location python
python -m unittest discover -s tests -v
```

## Project structure

```text
public/        Mobile-first real-time monitoring interface
server/        Node.js API, SSE, and static website server
python/        Audio, spectrogram, inference interfaces, hardware mocks, and CLI
data/          Latest state, event history, and risk rules
AGENTS.md      Coordinator and division collaboration rules
PROJECT_STATUS.md  First-version progress and issue log
```

## First-version risk rules

The thresholds in `data/risk-rules.json` are provisional integration-test values, not thresholds recovered from the original project. They can be updated through the API or configuration file and must be recalibrated after the new dataset and model are validated.

## Optional AI and audio dependencies

- `python/requirements-audio.txt`: generates Mel spectrograms.
- `python/requirements-model.txt`: loads a real TensorFlow model.

If an optional dependency or model file is missing, the program fails explicitly instead of presenting random output as a real prediction.

## Known limitations

- The original audio dataset, full 7–10 class specification, training code, and model weights were lost and must be rebuilt.
- Current emotion outputs are simulation events and cannot be claimed as real AI accuracy.
- Risk thresholds are integration-test values, not research-validated safety standards.
- Raspberry Pi hardware, USB microphone, physical buzzer, battery life, weight, and collar movement still require renewed hardware testing.
- Monitoring currently works on the local network only; cloud accounts and remote notifications are not implemented.

## Next versions

See [ROADMAP.md](ROADMAP.md) for the research basis, proposed dataset contract, and staged implementation plan.

- Rebuild, label, and balance the dog-vocalization dataset.
- Add audio denoising, loudness normalization, segmentation, and augmentation.
- Train, evaluate, and deploy a production TensorFlow model.
- Reconnect Raspberry Pi audio capture and the GPIO buzzer.
- Add LINE, email, or SMS notifications.
- Add GPS, heart-rate, temperature, and activity sensors.
- Add cloud deployment, accounts, and multi-pet management.

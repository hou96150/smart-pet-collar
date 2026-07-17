// 這三組對照表是後端事件值與畫面文字的邊界；新增類別時要同步確認事件契約與風險規則。
const EMOTION_LABELS = Object.freeze({
  happy: '開心',
  angry: '生氣',
  fearful: '害怕',
  sad: '悲傷',
  fearful_aggressive: '害怕且具攻擊性',
  unknown: '無法辨識',
});

const RISK_LABELS = Object.freeze({
  low: '低風險',
  medium: '中風險',
  high: '高風險',
});

const SOURCE_LABELS = Object.freeze({
  simulation: '模擬事件',
  audio: '錄音分析',
  model: '模型推論',
});

// 啟動時集中查找一次 DOM，避免更新即時資料時反覆查詢相同元素。
const elements = {
  connectionDot: document.querySelector('#connection-dot'),
  connectionText: document.querySelector('#connection-text'),
  currentEmotion: document.querySelector('#current-emotion'),
  currentConfidence: document.querySelector('#current-confidence'),
  currentRisk: document.querySelector('#current-risk'),
  liveWorkbench: document.querySelector('.live-workbench'),
  lastUpdated: document.querySelector('#last-updated'),
  sourceLabel: document.querySelector('#source-label'),
  statusMessage: document.querySelector('#status-message'),
  warningPanel: document.querySelector('#warning-panel'),
  warningMessage: document.querySelector('#warning-message'),
  warningTime: document.querySelector('#warning-time'),
  historyList: document.querySelector('#history-list'),
  refreshHistory: document.querySelector('#refresh-history'),
  testForm: document.querySelector('#test-form'),
  testEmotion: document.querySelector('#test-emotion'),
  testConfidence: document.querySelector('#test-confidence'),
  confidenceOutput: document.querySelector('#confidence-output'),
  sendTest: document.querySelector('#send-test'),
  formMessage: document.querySelector('#form-message'),
  riskDialog: document.querySelector('#risk-dialog'),
  dialogEmotion: document.querySelector('#dialog-emotion'),
  dialogConfidence: document.querySelector('#dialog-confidence'),
  acknowledgeWarning: document.querySelector('#acknowledge-warning'),
  mainContent: document.querySelector('#main-content'),
};

// POST 回應與 SSE 可能收到同一事件，用 ID 避免同一筆資料重複更新畫面。
let latestEventId = null;

function formatConfidence(confidence) {
  if (!Number.isFinite(confidence)) return '—';
  return new Intl.NumberFormat('zh-TW', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(confidence);
}

function formatTime(timestamp) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return '時間未知';
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);
}

function eventLabel(event) {
  return EMOTION_LABELS[event.emotion] ?? EMOTION_LABELS.unknown;
}

function riskLabel(event) {
  return RISK_LABELS[event.riskLevel] ?? '未判定';
}

function animateValue(element) {
  // 先移除再於下一個影格加回 class，連續事件才能重新播放更新動畫。
  element.classList.remove('value-updated');
  requestAnimationFrame(() => element.classList.add('value-updated'));
}

function updateRiskAlert(riskLevel) {
  const normalizedRisk = riskLevel ?? 'unknown';
  elements.liveWorkbench.dataset.risk = normalizedRisk;

  if (normalizedRisk !== 'high') {
    elements.liveWorkbench.classList.remove('risk-alert-pulse');
    return;
  }

  // 高風險只播放有限次脈衝；CSS 的 reduced-motion 規則會把它改成靜態警示。
  if (!elements.liveWorkbench.classList.contains('risk-alert-pulse')) {
    elements.liveWorkbench.classList.add('risk-alert-pulse');
  }
}

function setConnection(state, label) {
  elements.connectionDot.dataset.state = state;
  elements.connectionText.textContent = label;
}

function updateWarning(event) {
  elements.warningPanel.dataset.risk = event.riskLevel;
  elements.warningTime.textContent = formatTime(event.timestamp);
  if (event.riskLevel === 'high') {
    elements.warningMessage.textContent = `偵測到「${eventLabel(event)}」，請立即確認狗狗與周遭環境。`;
  } else if (event.riskLevel === 'medium') {
    elements.warningMessage.textContent = `目前為中度風險，建議持續觀察狗狗狀態。`;
  } else {
    elements.warningMessage.textContent = '目前沒有需要處理的警告。';
  }
}

function openRiskDialog(event) {
  if (elements.riskDialog.open) return;
  elements.dialogEmotion.textContent = eventLabel(event);
  elements.dialogConfidence.textContent = formatConfidence(event.confidence);
  // 對話框開啟時停用背景操作，關閉事件會恢復 main 的互動能力。
  elements.mainContent.inert = true;
  elements.riskDialog.showModal();
  elements.acknowledgeWarning.focus();
}

function updateCurrent(event, options = {}) {
  if (!event) return;
  latestEventId = event.id;
  elements.currentEmotion.textContent = eventLabel(event);
  elements.currentConfidence.textContent = formatConfidence(event.confidence);
  elements.currentRisk.textContent = riskLabel(event);
  elements.currentRisk.dataset.risk = event.riskLevel ?? 'unknown';
  updateRiskAlert(event.riskLevel);
  elements.lastUpdated.textContent = formatTime(event.timestamp);
  elements.sourceLabel.textContent = SOURCE_LABELS[event.source] ?? '來源未知';
  [elements.currentEmotion, elements.currentConfidence, elements.currentRisk].forEach(animateValue);
  updateWarning(event);
  elements.statusMessage.textContent = '已同步最新辨識結果。';
  elements.statusMessage.dataset.state = 'success';
  // 初次載入歷史狀態時可傳入 alert:false，避免每次重新整理都彈出舊警告。
  if (event.riskLevel === 'high' && options.alert !== false) openRiskDialog(event);
}

function createHistoryItem(event) {
  // 使用 textContent 建立節點，不把後端資料當成 HTML 插入頁面。
  const article = document.createElement('article');
  article.className = 'history-item';

  const main = document.createElement('div');
  main.className = 'history-item__main';
  const emotion = document.createElement('p');
  emotion.className = 'history-item__emotion';
  emotion.textContent = eventLabel(event);
  const meta = document.createElement('p');
  meta.className = 'history-item__meta';
  meta.textContent = `${formatTime(event.timestamp)} · ${SOURCE_LABELS[event.source] ?? '來源未知'} · ${formatConfidence(event.confidence)}`;
  main.append(emotion, meta);

  const badge = document.createElement('span');
  badge.className = 'risk-badge';
  badge.dataset.risk = event.riskLevel ?? 'unknown';
  badge.textContent = riskLabel(event);

  article.append(main, badge);
  return article;
}

function renderHistory(events) {
  elements.historyList.replaceChildren();
  if (!Array.isArray(events) || events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const message = document.createElement('p');
    message.textContent = '目前還沒有辨識紀錄。';
    const action = document.createElement('a');
    action.href = '#test-tools';
    action.textContent = '產生第一筆測試事件';
    empty.append(message, action);
    elements.historyList.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  events.forEach((event) => fragment.append(createHistoryItem(event)));
  elements.historyList.append(fragment);
}

async function requestJson(url, options) {
  // 統一 API 錯誤格式，讓畫面只需要處理一般 Error。
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `請求失敗（${response.status}）`);
  return payload;
}

async function loadStatus() {
  try {
    const payload = await requestJson('/api/status');
    if (payload.latest) updateCurrent(payload.latest, { alert: false });
    else {
      elements.statusMessage.textContent = '監控已就緒，正在等待第一次辨識。';
      elements.statusMessage.dataset.state = 'success';
    }
  } catch (error) {
    elements.statusMessage.textContent = `無法讀取目前狀態。${error.message} 請確認後端服務正在執行。`;
    elements.statusMessage.dataset.state = 'error';
  }
}

async function loadHistory() {
  elements.refreshHistory.disabled = true;
  elements.refreshHistory.dataset.state = 'loading';
  elements.refreshHistory.textContent = '讀取中';
  try {
    const payload = await requestJson('/api/history?limit=50');
    renderHistory(payload.events);
    elements.refreshHistory.dataset.state = 'success';
    elements.refreshHistory.textContent = '已重新整理';
  } catch (error) {
    elements.refreshHistory.dataset.state = 'error';
    elements.refreshHistory.textContent = '重新整理失敗';
    elements.statusMessage.textContent = `無法讀取辨識歷史。${error.message} 請稍後再試。`;
    elements.statusMessage.dataset.state = 'error';
  } finally {
    elements.refreshHistory.disabled = false;
    window.setTimeout(() => {
      elements.refreshHistory.dataset.state = 'default';
      elements.refreshHistory.textContent = '重新整理';
    }, 1800);
  }
}

function connectEvents() {
  // EventSource 斷線後會由瀏覽器自動重連，適合目前「後端單向推送狀態」的需求。
  const stream = new EventSource('/api/events');
  stream.addEventListener('open', () => setConnection('connected', '即時監控已連線'));
  stream.addEventListener('error', () => setConnection('error', '連線中斷，正在重試'));
  stream.addEventListener('recognition', (message) => {
    try {
      const event = JSON.parse(message.data);
      updateCurrent(event);
      loadHistory();
    } catch {
      elements.statusMessage.textContent = '收到無法解析的即時資料，請檢查後端事件格式。';
      elements.statusMessage.dataset.state = 'error';
    }
  });
}

elements.testConfidence.addEventListener('input', () => {
  elements.confidenceOutput.value = formatConfidence(Number(elements.testConfidence.value));
});

elements.testForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.sendTest.disabled = true;
  elements.sendTest.dataset.state = 'loading';
  elements.sendTest.textContent = '正在送出';
  elements.formMessage.textContent = '';
  delete elements.formMessage.dataset.state;
  try {
    const created = await requestJson('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        emotion: elements.testEmotion.value,
        confidence: Number(elements.testConfidence.value),
        source: 'simulation',
        audioFile: null,
      }),
    });
    // SSE 通常會先送達；只有尚未收到同一 ID 時才直接使用 POST 回應更新。
    if (created.id !== latestEventId) updateCurrent(created);
    elements.sendTest.dataset.state = 'success';
    elements.sendTest.textContent = '事件已送出';
    elements.formMessage.textContent = '模擬事件已寫入辨識歷史。';
    elements.formMessage.dataset.state = 'success';
    await loadHistory();
  } catch (error) {
    elements.sendTest.dataset.state = 'error';
    elements.sendTest.textContent = '重新送出';
    elements.formMessage.textContent = `測試事件未送出。${error.message} 請確認後端服務後再試。`;
    elements.formMessage.dataset.state = 'error';
  } finally {
    elements.sendTest.disabled = false;
    window.setTimeout(() => {
      if (elements.sendTest.dataset.state === 'success') {
        elements.sendTest.dataset.state = 'default';
        elements.sendTest.textContent = '送出測試事件';
      }
    }, 1800);
  }
});

elements.refreshHistory.addEventListener('click', loadHistory);

elements.liveWorkbench.addEventListener('animationend', (event) => {
  if (event.animationName === 'risk-alert-pulse') {
    // 移除 class 後，下一筆高風險事件才能再次觸發脈衝。
    elements.liveWorkbench.classList.remove('risk-alert-pulse');
  }
});

elements.riskDialog.addEventListener('close', () => {
  elements.mainContent.inert = false;
});

elements.riskDialog.addEventListener('click', (event) => {
  if (event.target === elements.riskDialog) elements.riskDialog.close();
});

// 狀態與歷史可平行載入；無論其中一個是否失敗，都要開始監聽後續即時事件。
Promise.all([loadStatus(), loadHistory()]).finally(connectEvents);

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// 這三組白名單就是後端接受的資料契約；新增類別時要同步檢查前端與 Python 端。
const EMOTIONS = new Set([
  'happy',
  'angry',
  'fearful',
  'sad',
  'fearful_aggressive',
  'unknown',
]);
const RISK_LEVELS = new Set(['low', 'medium', 'high']);
const SOURCES = new Set(['simulation', 'audio', 'model']);
// 限制單次請求大小，避免錯誤程式或外部請求耗盡 Raspberry Pi 的記憶體。
const MAX_BODY_BYTES = 1024 * 1024;

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('請求內容不得超過 1 MB。');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('請求內容必須是有效的 JSON。');
    error.statusCode = 400;
    throw error;
  }
}

function validateEventInput(input) {
  // riskLevel 不由呼叫端提供，後端會依目前規則自行計算，避免來源各自判斷造成不一致。
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['事件內容必須是物件。'];
  }
  if (!EMOTIONS.has(input.emotion)) {
    errors.push(`emotion 必須是以下其中之一：${[...EMOTIONS].join(', ')}。`);
  }
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence)
      || input.confidence < 0 || input.confidence > 1) {
    errors.push('confidence 必須是 0 到 1 之間的數字。');
  }
  if (!SOURCES.has(input.source)) {
    errors.push(`source 必須是以下其中之一：${[...SOURCES].join(', ')}。`);
  }
  if (input.audioFile !== undefined && input.audioFile !== null
      && typeof input.audioFile !== 'string') {
    errors.push('audioFile 必須是字串或 null。');
  }
  return errors;
}

function validateRiskRules(input) {
  // 規則會直接影響警告等級，因此整份設定必須先通過驗證才可寫入檔案。
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['風險規則必須是物件。'];
  }
  if (!RISK_LEVELS.has(input.defaultRiskLevel)) {
    errors.push('defaultRiskLevel 必須是 low、medium 或 high。');
  }
  if (!Array.isArray(input.rules)) {
    errors.push('rules 必須是陣列。');
    return errors;
  }
  input.rules.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      errors.push(`rules[${index}] 必須是物件。`);
      return;
    }
    if (!EMOTIONS.has(rule.emotion)) {
      errors.push(`rules[${index}].emotion 不在支援的情緒類別中。`);
    }
    if (typeof rule.minConfidence !== 'number' || !Number.isFinite(rule.minConfidence)
        || rule.minConfidence < 0 || rule.minConfidence > 1) {
      errors.push(`rules[${index}].minConfidence 必須是 0 到 1 之間的數字。`);
    }
    if (!RISK_LEVELS.has(rule.riskLevel)) {
      errors.push(`rules[${index}].riskLevel 必須是 low、medium 或 high。`);
    }
  });
  return errors;
}

function calculateRisk(emotion, confidence, config) {
  // 同一情緒可能有多個門檻；優先採用已達成門檻中最嚴格（數值最高）的規則。
  const matchingRules = config.rules
    .filter((rule) => rule.emotion === emotion && confidence >= rule.minConfidence)
    .sort((left, right) => right.minConfidence - left.minConfidence);
  return matchingRules[0]?.riskLevel ?? config.defaultRiskLevel;
}

async function writeJsonAtomic(filePath, value) {
  // 先完整寫入暫存檔再取代正式檔，避免中途中斷留下半份 JSON。
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

async function createStore(dataDirectory) {
  const historyPath = path.join(dataDirectory, 'history.jsonl');
  const latestPath = path.join(dataDirectory, 'latest.json');
  const rulesPath = path.join(dataDirectory, 'risk-rules.json');
  await fs.mkdir(dataDirectory, { recursive: true });
  // 將事件寫入串成單一路徑，確保 history 與 latest 的順序一致，不會互相覆蓋。
  let pendingEventWrite = Promise.resolve();

  async function readJson(filePath, fallback) {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return fallback;
    }
  }

  return {
    async getLatest() {
      return readJson(latestPath, null);
    },
    async getRules() {
      return readJson(rulesPath, { defaultRiskLevel: 'low', rules: [] });
    },
    async setRules(rules) {
      await writeJsonAtomic(rulesPath, rules);
    },
    async addEvent(event) {
      const writeEvent = async () => {
        await fs.appendFile(historyPath, `${JSON.stringify(event)}\n`, 'utf8');
        await writeJsonAtomic(latestPath, event);
      };
      pendingEventWrite = pendingEventWrite.then(writeEvent, writeEvent);
      await pendingEventWrite;
    },
    async getHistory(limit) {
      let content;
      try {
        content = await fs.readFile(historyPath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
      return content.split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .slice(-limit)
        // 監控介面先顯示最新事件，所以讀取結果採新到舊排列。
        .reverse();
    },
  };
}

function createApp(options = {}) {
  const dataDirectory = options.dataDirectory ?? path.resolve(__dirname, '..', 'data');
  const publicDirectory = options.publicDirectory ?? path.resolve(__dirname, '..', 'public');
  const tokensPath = options.tokensPath ?? path.resolve(__dirname, '..', 'tokens.css');
  // Set 只保存目前仍連線的 SSE 回應；連線關閉時必須移除，避免長期占用記憶體。
  const clients = new Set();
  let storePromise = createStore(dataDirectory);

  function broadcast(event) {
    // 每次辨識完成後，使用同一種 recognition 事件格式推送給所有監控頁面。
    const message = `event: recognition\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) client.write(message);
  }

  async function serveStatic(requestPath, response) {
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
    const resolvedPath = path.resolve(publicDirectory, relativePath);
    const publicRoot = `${path.resolve(publicDirectory)}${path.sep}`;
    // 解析後的路徑必須仍位於 public 目錄內，阻擋 ../ 等路徑穿越讀取私有檔案。
    if (resolvedPath !== path.resolve(publicDirectory) && !resolvedPath.startsWith(publicRoot)) {
      sendJson(response, 403, { error: '禁止存取此路徑。' });
      return;
    }
    try {
      const file = await fs.readFile(resolvedPath);
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[path.extname(resolvedPath).toLowerCase()]
          ?? 'application/octet-stream',
      });
      response.end(file);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
        sendJson(response, 404, { error: '找不到指定資源。' });
        return;
      }
      throw error;
    }
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      const store = await storePromise;

      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/status') {
        sendJson(response, 200, { latest: await store.getLatest() });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/history') {
        const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
        const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 50;
        sendJson(response, 200, { events: await store.getHistory(limit) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/risk-rules') {
        sendJson(response, 200, await store.getRules());
        return;
      }
      if (request.method === 'PUT' && url.pathname === '/api/risk-rules') {
        const input = await readJsonBody(request);
        const errors = validateRiskRules(input);
        if (errors.length) {
          sendJson(response, 400, { error: '風險規則驗證失敗。', details: errors });
          return;
        }
        await store.setRules(input);
        sendJson(response, 200, input);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/events') {
        const input = await readJsonBody(request);
        const errors = validateEventInput(input);
        if (errors.length) {
          sendJson(response, 400, { error: '辨識事件驗證失敗。', details: errors });
          return;
        }
        const rules = await store.getRules();
        // id、時間與風險一律由後端產生，讓歷史紀錄與即時推送共用可信的事件內容。
        const event = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          emotion: input.emotion,
          confidence: input.confidence,
          riskLevel: calculateRisk(input.emotion, input.confidence, rules),
          source: input.source,
          audioFile: input.audioFile ?? null,
        };
        await store.addEvent(event);
        // 先完成持久化再廣播，確保前端收到事件時，重新整理也能從歷史資料找回它。
        broadcast(event);
        sendJson(response, 201, event);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/events') {
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        // SSE 註解行可立即送出回應標頭，也讓前端知道連線已建立。
        response.write(': connected\n\n');
        clients.add(response);
        // 瀏覽器離線或關頁時移除回應物件，後續廣播就不再寫入失效連線。
        request.on('close', () => clients.delete(response));
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: '找不到指定 API。' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/tokens.css') {
        try {
          const file = await fs.readFile(tokensPath);
          response.writeHead(200, { 'content-type': CONTENT_TYPES['.css'] });
          response.end(file);
        } catch (error) {
          if (error.code === 'ENOENT' || error.code === 'EISDIR') {
            sendJson(response, 404, { error: '找不到指定資源。' });
            return;
          }
          throw error;
        }
        return;
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        await serveStatic(url.pathname, response);
        return;
      }
      sendJson(response, 405, { error: '不支援此請求方法。' });
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : '伺服器發生未預期錯誤。',
      });
    }
  });

  server.on('close', () => {
    // 測試或程式關閉時主動結束所有 SSE 連線，避免程序因未釋放連線而無法退出。
    for (const client of clients) client.end();
    clients.clear();
  });

  return server;
}

module.exports = {
  calculateRisk,
  createApp,
  validateEventInput,
  validateRiskRules,
};

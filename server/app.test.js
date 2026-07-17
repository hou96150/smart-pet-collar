const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('./app');

const defaultRules = {
  defaultRiskLevel: 'low',
  rules: [
    { emotion: 'fearful_aggressive', minConfidence: 0.7, riskLevel: 'high' },
    { emotion: 'fearful_aggressive', minConfidence: 0.4, riskLevel: 'medium' },
  ],
};

async function startTestServer(t) {
  // 每個測試使用獨立暫存目錄與隨機連接埠，避免修改正式 data 或彼此污染狀態。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-collar-'));
  const dataDirectory = path.join(root, 'data');
  const publicDirectory = path.join(root, 'public');
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.mkdir(publicDirectory, { recursive: true });
  await fs.writeFile(path.join(dataDirectory, 'risk-rules.json'), JSON.stringify(defaultRules));
  await fs.writeFile(path.join(publicDirectory, 'index.html'), '<h1>pet collar</h1>');
  const tokensPath = path.join(root, 'tokens.css');
  await fs.writeFile(tokensPath, ':root { --color-paper: white; }');
  await fs.writeFile(path.join(root, 'private.txt'), 'not public');
  const server = createApp({ dataDirectory, publicDirectory, tokensPath });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  return { baseUrl: `http://127.0.0.1:${address.port}`, dataDirectory };
}

test('提供靜態首頁與健康檢查', async (t) => {
  const { baseUrl } = await startTestServer(t);
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /pet collar/);
  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), { status: 'ok' });
});

test('只公開根目錄 tokens.css，不擴大靜態存取範圍', async (t) => {
  const { baseUrl } = await startTestServer(t);
  const tokens = await fetch(`${baseUrl}/tokens.css`);
  assert.equal(tokens.status, 200);
  assert.equal(tokens.headers.get('content-type'), 'text/css; charset=utf-8');
  assert.match(await tokens.text(), /--color-paper/);

  const privateFile = await fetch(`${baseUrl}/private.txt`);
  assert.equal(privateFile.status, 404);
  // 編碼後的 ../ 也不可越過 public 邊界取得同層私有檔案。
  const traversal = await fetch(`${baseUrl}/..%2Fprivate.txt`);
  assert.notEqual(traversal.status, 200);
});

test('建立事件、計算風險並持久保存歷史', async (t) => {
  const { baseUrl, dataDirectory } = await startTestServer(t);
  const createdResponse = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      emotion: 'fearful_aggressive',
      confidence: 0.86,
      source: 'simulation',
      audioFile: null,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.riskLevel, 'high');
  assert.ok(created.id);
  assert.ok(created.timestamp);

  const status = await (await fetch(`${baseUrl}/api/status`)).json();
  assert.deepEqual(status.latest, created);
  const history = await (await fetch(`${baseUrl}/api/history`)).json();
  assert.deepEqual(history.events, [created]);
  // 不只檢查 API 回應，也直接讀檔確認事件真的落盤。
  const persisted = await fs.readFile(path.join(dataDirectory, 'history.jsonl'), 'utf8');
  assert.deepEqual(JSON.parse(persisted.trim()), created);
});

test('拒絕未知情緒與無效信心值', async (t) => {
  const { baseUrl } = await startTestServer(t);
  const response = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ emotion: 'excited', confidence: 3, source: 'simulation' }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.details.length, 2);
});

test('可更新風險規則，並套用到後續事件', async (t) => {
  const { baseUrl } = await startTestServer(t);
  const newRules = {
    defaultRiskLevel: 'low',
    rules: [{ emotion: 'angry', minConfidence: 0.5, riskLevel: 'high' }],
  };
  const update = await fetch(`${baseUrl}/api/risk-rules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(newRules),
  });
  assert.equal(update.status, 200);

  const event = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ emotion: 'angry', confidence: 0.8, source: 'model' }),
  });
  assert.equal((await event.json()).riskLevel, 'high');
});

test('透過 SSE 推送新辨識事件', async (t) => {
  const { baseUrl } = await startTestServer(t);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
  const reader = stream.body.getReader();
  // 先讀掉伺服器的 connected 訊息，下一段資料才會是本測試建立的辨識事件。
  await reader.read();

  const createdResponse = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ emotion: 'happy', confidence: 0.9, source: 'simulation' }),
  });
  const created = await createdResponse.json();
  const pushed = new TextDecoder().decode((await reader.read()).value);
  assert.match(pushed, /event: recognition/);
  assert.match(pushed, new RegExp(created.id));
  await reader.cancel();
});

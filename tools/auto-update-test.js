const WebSocket = require('ws');
const { request } = require('http');
const { request: httpsRequest } = require('https');
const { URL } = require('url');

const wsUrl = process.argv[2] || 'ws://127.0.0.1:8080';
const apiBase = process.argv[3] || 'http://127.0.0.1:8001/api';
const count = Number(process.argv[4] || 200);
const intervalMs = Number(process.argv[5] || 50);

function postJson(urlStr, obj) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const data = JSON.stringify(obj);
      const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } };
      const reqFn = u.protocol === 'https:' ? httpsRequest : request;
      const req = reqFn(u, opts, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk.toString());
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', (e) => reject(e));
      req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

console.log('Auto-update test starting', { wsUrl, apiBase, count, intervalMs });

const ws = new WebSocket(wsUrl);
ws.on('open', async () => {
  console.log('WS open');
  for (let i = 1; i <= count; i++) {
    const msg = { type: 'diagram:update', updated_at: new Date().toISOString(), state: { test: true, i } };
    try { ws.send(JSON.stringify(msg)); console.log('WS sent', i); } catch (e) { console.warn('WS send failed', e && e.message); }
    // also POST to API
    try {
      const res = await postJson(`${apiBase.replace(/\/$/, '')}/diagram/state`, msg.state);
      console.log('POST', i, 'status', res.status);
    } catch (e) { console.warn('POST failed', e && e.message); }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.log('All messages sent, closing WS');
  try { ws.close(); } catch (e) {}
  process.exit(0);
});

ws.on('message', (m) => { console.log('msg from server', m.toString()); });
ws.on('error', (e) => { console.error('WS error', e && e.message); });
ws.on('close', () => { console.log('WS closed'); });

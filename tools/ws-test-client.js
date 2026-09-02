const WebSocket = require('ws');
const url = process.argv[2] || 'ws://127.0.0.1:8080';
const ws = new WebSocket(url);
ws.on('open', () => {
  console.log('connected to', url);
  ws.send(JSON.stringify({ type: 'diagram:update', updated_at: new Date().toISOString(), state: { test: true } }));
});
ws.on('message', (m) => { console.log('msg:', m.toString()); });
ws.on('close', () => { console.log('closed'); process.exit(0); });
ws.on('error', (e) => { console.error('error', e.message); process.exit(1); });
setTimeout(() => { try { ws.close(); } catch (e) {} }, 3000);

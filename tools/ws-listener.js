const WebSocket = require('ws');
const url = process.argv[2] || 'ws://127.0.0.1:8080';
const ws = new WebSocket(url);
ws.on('open', () => {
  console.log('listener connected to', url);
});
ws.on('message', (m) => { console.log('listener msg:', m.toString()); });
ws.on('close', () => { console.log('listener closed'); process.exit(0); });
ws.on('error', (e) => { console.error('listener error', e.message); process.exit(1); });
setTimeout(() => { console.log('listener timeout exit'); process.exit(0); }, 20000);

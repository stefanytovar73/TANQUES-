const WebSocket = require('ws');
const port = process.env.WS_PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`WebSocket server listening on ws://0.0.0.0:${port}`);

wss.on('connection', function connection(ws, req) {
  const clientId = Math.random().toString(36).slice(2, 10);
  const remote = req && req.socket ? `${req.socket.remoteAddress}:${req.socket.remotePort}` : 'unknown';
  console.log(`[WS] client connected ${clientId} from ${remote}. total=${wss.clients.size}`);

  ws.on('message', function incoming(message) {
    try {
      const raw = message.toString();
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { msg = raw; }
      console.log(`[WS] recv from ${clientId}:`, typeof msg === 'string' ? msg : JSON.stringify(msg));

      // broadcast to other clients and log how many received
      let sent = 0;
      wss.clients.forEach(function each(client) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          try { client.send(JSON.stringify(msg)); sent++; } catch (e) { console.warn('[WS] broadcast error', e && e.message); }
        }
      });
      console.log(`[WS] broadcast from ${clientId} to ${sent} clients`);
    } catch (e) {
      console.error('[WS] invalid ws message', e && e.message);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WS] client ${clientId} disconnected (${code})`);
  });
  ws.on('error', (err) => {
    console.error(`[WS] client ${clientId} error:`, err && err.message);
  });
});

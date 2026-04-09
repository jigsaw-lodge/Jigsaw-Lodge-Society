const WebSocket = require('ws');
const clients = [];
for (let i = 0; i < 10; i += 1) {
  const ws = new WebSocket('ws://localhost:3010');
  ws.on('open', () => console.log('client', i, 'open'));
  ws.on('error', (err) => console.error('client', i, 'error', err));
  clients.push(ws);
}
setInterval(() => {
  console.log('open connections:', clients.filter(c => c.readyState === WebSocket.OPEN).length);
}, 1000);

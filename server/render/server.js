// 纯 Node + ws 实现的房间中继服务器（Render 免费 Web Service 部署）
// 协议与 PartyServer 版本完全一致：welcome / join / leave + 客户端消息原样中继。
// 服务器只做转发，不做权威校验（休闲玩法，客户端权威）。
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;

// roomId -> Set<ws>
const rooms = new Map();
// ws -> { id, room }
const meta = new WeakMap();

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('fishing-duel room server ok');
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // 兼容客户端路径 /parties/main/:room
  const m = req.url.match(/^\/parties\/main\/([^/?#]+)/);
  if (!m) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  const room = decodeURIComponent(m[1]);
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, { room });
  });
});

wss.on('connection', (ws, { room }) => {
  const id = crypto.randomUUID();
  if (!rooms.has(room)) rooms.set(room, new Set());
  const set = rooms.get(room);
  const peerIds = [...set].map((p) => meta.get(p).id);

  meta.set(ws, { id, room });
  set.add(ws);

  ws.send(JSON.stringify({ t: 'welcome', id, peers: peerIds }));
  broadcast(room, { t: 'join', id }, ws);

  ws.on('message', (data, isBinary) => {
    // 客户端消息原样转发给同房间其他玩家（消息内部已带发送者 id）
    for (const p of rooms.get(room) || []) {
      if (p !== ws && p.readyState === 1) p.send(data, { binary: isBinary });
    }
  });

  ws.on('close', () => {
    const cur = rooms.get(room);
    if (!cur) return;
    cur.delete(ws);
    if (cur.size === 0) rooms.delete(room);
    else broadcast(room, { t: 'leave', id });
  });

  ws.on('error', () => { /* 防止未处理异常，close 会随后触发 */ });
});

function broadcast(room, obj, except) {
  const text = JSON.stringify(obj);
  for (const p of rooms.get(room) || []) {
    if (p !== except && p.readyState === 1) p.send(text);
  }
}

server.listen(PORT, () => {
  console.log('fishing-duel room server listening on ' + PORT);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function makeCode() {
  let code;
  do { code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function roomSummary(room) {
  return { code: room.code, status: room.status, players: { white: !!room.white, black: !!room.black }, game: room.game };
}
function sendRoom(room) { io.to(room.code).emit('room:state', roomSummary(room)); }
function leaveCurrent(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = null;
  socket.data.role = null;
  if (!room) return;
  const wasHost = room.white?.socketId === socket.id;
  if (wasHost) {
    rooms.delete(code);
    io.to(code).emit('room:closed', 'Chủ phòng đã rời. Phòng đã đóng.');
    return;
  }
  if (room.black?.socketId === socket.id) room.black = null;
  if (!room.white && !room.black) rooms.delete(code);
  else {
    if (room.status === 'playing') room.status = 'waiting';
    room.game = null;
    sendRoom(room);
    io.to(code).emit('room:notice', 'Một người chơi đã rời phòng. Phòng trở về trạng thái chờ.');
  }
}

io.on('connection', socket => {
  socket.on('room:create', (_data, ack) => {
    if (typeof _data === 'function') ack = _data;
    if (typeof ack !== 'function') ack = () => {};
    leaveCurrent(socket);
    const code = makeCode();
    const room = { code, status: 'waiting', white: { socketId: socket.id }, black: null, game: null, createdAt: Date.now() };
    rooms.set(code, room);
    socket.join(code); socket.data.roomCode = code; socket.data.role = 'host';
    ack({ ok: true, code, role: 'host' }); sendRoom(room);
  });

  socket.on('room:join', ({ code } = {}, ack = () => {}) => {
    code = String(code || '').toUpperCase().trim();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return ack({ ok: false, error: 'Mã phòng không hợp lệ.' });
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: 'Không tìm thấy phòng.' });
    if (room.status === 'playing') return ack({ ok: false, error: 'Phòng đang trong ván đấu.' });
    if (socket.data.roomCode === code) return ack({ ok: true, code, role: socket.data.role, room: roomSummary(room) });
    if (room.black && room.black.socketId !== socket.id) return ack({ ok: false, error: 'Phòng đã đủ người.' });
    leaveCurrent(socket);
    room.black = { socketId: socket.id };
    room.status = 'ready';
    socket.join(code); socket.data.roomCode = code; socket.data.role = 'guest';
    ack({ ok: true, code, role: 'guest' }); sendRoom(room);
  });

  socket.on('room:start', (ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || socket.data.role !== 'host') return ack({ ok: false, error: 'Chỉ chủ phòng có thể bắt đầu.' });
    if (!room.white || !room.black) return ack({ ok: false, error: 'Cần đủ hai người chơi.' });
    room.status = 'playing';
    room.game = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', seq: 0, history: [] };
    ack({ ok: true }); sendRoom(room); io.to(room.code).emit('game:start', room.game);
  });

  socket.on('game:move', (payload, ack = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing' || !room.game) return ack({ ok: false, error: 'Ván đấu không còn hoạt động.' });
    const role = socket.data.role;
    const expectedColor = role === 'host' ? 'w' : role === 'guest' ? 'b' : null;
    const currentTurn = String(room.game.fen || '').split(' ')[1];
    if (!expectedColor || currentTurn !== expectedColor) return ack({ ok: false, error: 'Không phải lượt của bạn.' });
    if (Number(payload?.expectedSeq) !== Number(room.game.seq)) return ack({ ok: false, error: 'Dữ liệu ván đấu đã cập nhật. Đồng bộ lại.' });
    if (typeof payload?.fen !== 'string' || payload.fen.length > 160) return ack({ ok: false, error: 'FEN không hợp lệ.' });
    if (!Array.isArray(payload?.history) || payload.history.length > 500) return ack({ ok: false, error: 'Lịch sử nước đi không hợp lệ.' });
    const nextTurn = payload.fen.split(' ')[1];
    if (nextTurn !== (expectedColor === 'w' ? 'b' : 'w')) return ack({ ok: false, error: 'Dữ liệu lượt đi không hợp lệ.' });
    room.game = { fen: payload.fen, history: payload.history, seq: room.game.seq + 1 };
    ack({ ok: true, seq: room.game.seq });
    io.to(room.code).emit('game:state', room.game);
  });

  socket.on('room:leave', () => leaveCurrent(socket));
  socket.on('disconnect', () => leaveCurrent(socket));
});

// Remove empty rooms older than 3 hours; active rooms are kept until players leave.
setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  for (const [code, room] of rooms) if (!room.white && !room.black && room.createdAt < cutoff) rooms.delete(code);
}, 60 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Chess Online listening on ${PORT}`));

(() => {
  const $ = id => document.getElementById(id);
  const panel = $('onlinePanel'), roomInfo = $('roomInfo'), message = $('onlineMessage');
  const codeInput = $('roomCodeInput'), codeDisplay = $('roomCodeDisplay'), roomStatus = $('roomStatus');
  const hostStatus = $('roomHostStatus'), guestStatus = $('roomGuestStatus');
  let socket = null, currentRoom = null, currentRole = null;
  const say = text => { message.textContent = text || ''; };
  const setActionsVisible = visible => document.querySelectorAll('.online-actions').forEach(el => el.classList.toggle('hidden', !visible));
  function connect() {
    if (socket?.connected) return Promise.resolve(socket);
    if (!socket) socket = io({ autoConnect: false });
    socket.connect();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Không kết nối được máy chủ. Hãy thử lại.')), 8000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(socket); });
      socket.once('connect_error', err => { clearTimeout(timeout); reject(new Error('Lỗi kết nối server: ' + err.message)); });
    });
  }
  function ackEmit(event, data) {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) return reject(new Error('Mất kết nối máy chủ.'));
      socket.emit(event, data, result => result?.ok ? resolve(result) : reject(new Error(result?.error || 'Thao tác thất bại.')));
    });
  }
  function showRoom(code, role) {
    currentRoom = code; currentRole = role;
    roomInfo.classList.remove('hidden'); codeDisplay.textContent = code;
    $('roomRoleLabel').textContent = role === 'host' ? 'Bạn là Trắng (chủ phòng)' : 'Bạn là Đen';
    $('btnStartOnline').classList.toggle('hidden', role !== 'host');
    $('btnStartOnline').disabled = true;
    $('btnOnlinePlay').classList.add('hidden'); $('btnLeaveRoom').classList.remove('hidden');
    setActionsVisible(false);
  }
  function updateRoom(room) {
    if (!room || room.code !== currentRoom) return;
    const full = room.players.white && room.players.black;
    hostStatus.textContent = room.players.white ? '♙ Trắng: Đã kết nối' : '♙ Trắng: Đang chờ';
    guestStatus.textContent = room.players.black ? '♟ Đen: Đã kết nối' : '♟ Đen: Đang chờ đối thủ...';
    roomStatus.textContent = room.status === 'playing' ? '♟ Ván đấu đang diễn ra' : full ? 'Đã đủ người. Chủ phòng có thể bắt đầu.' : 'Đang chờ người chơi thứ hai...';
    $('btnStartOnline').disabled = !full || room.status === 'playing';
    $('btnStartOnline').classList.toggle('hidden', currentRole !== 'host' || room.status === 'playing');
    $('btnOnlinePlay').classList.toggle('hidden', room.status !== 'playing');
    if (room.status === 'playing' && room.game) {
      if (!window.chessApp?.onlineRole) window.chessApp?.enterOnlineGame(currentRole);
      window.chessApp?.receiveOnlineState(room.game, currentRole);
    }
  }
  async function createRoom() {
    say('Đang tạo phòng...'); await connect();
    const result = await ackEmit('room:create');
    showRoom(result.code, result.role); updateRoom(result.room); say('Phòng đã tạo. Gửi mã cho đối thủ.');
  }
  async function joinRoom() {
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return say('Mã phòng phải gồm 6 ký tự.');
    say('Đang tìm phòng...'); await connect();
    const result = await ackEmit('room:join', { code });
    showRoom(result.code, result.role); updateRoom(result.room); say('Tham gia phòng thành công.');
  }
  async function startGame() {
    say('Đang bắt đầu ván...'); await ackEmit('room:start');
    say('Ván đấu đã bắt đầu!');
    panel.classList.add('hidden');
  }
  async function leaveRoom() {
    if (!currentRoom) return;
    socket?.emit('room:leave');
    currentRoom = null; currentRole = null;
    roomInfo.classList.add('hidden'); setActionsVisible(true); panel.classList.remove('hidden');
    window.chessApp?.exitOnlineGame(); say('Bạn đã rời phòng.');
  }
  socket = io({ autoConnect: false });
  socket.on('connect', () => say('Đã kết nối máy chủ online.'));
  socket.on('disconnect', () => { if (currentRoom) say('Mất kết nối. Đang thử kết nối lại...'); });
  socket.on('room:state', updateRoom);
  socket.on('room:notice', say);
  socket.on('room:closed', text => { say(text); currentRoom = null; currentRole = null; roomInfo.classList.add('hidden'); setActionsVisible(true); window.chessApp?.exitOnlineGame(); });
  socket.on('game:start', game => {
    if (!currentRoom) return;
    if (!window.chessApp?.onlineRole) window.chessApp?.enterOnlineGame(currentRole);
    window.chessApp?.receiveOnlineState(game, currentRole);
    panel.classList.add('hidden');
  });
  socket.on('game:state', game => window.chessApp?.receiveOnlineState(game, currentRole));
  $('btnOnline').addEventListener('click', () => { panel.classList.remove('hidden'); });
  $('btnOnlineClose').addEventListener('click', () => panel.classList.add('hidden'));
  panel.addEventListener('click', e => { if (e.target === panel) panel.classList.add('hidden'); });
  $('btnCreateRoom').addEventListener('click', () => createRoom().catch(e => say(e.message)));
  $('btnJoinRoom').addEventListener('click', () => joinRoom().catch(e => say(e.message)));
  $('btnCopyRoomCode').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentRoom); say('Đã sao chép mã phòng.'); }
    catch { say('Mã phòng: ' + currentRoom); }
  });
  $('btnStartOnline').addEventListener('click', () => startGame().catch(e => say(e.message)));
  $('btnOnlinePlay').addEventListener('click', () => { panel.classList.add('hidden'); window.chessApp?.enterOnlineGame(currentRole); });
  $('btnLeaveRoom').addEventListener('click', () => leaveRoom().catch(e => say(e.message)));
  window.OnlineChess = {
    get active() { return !!currentRoom; },
    get role() { return currentRole; },
    get color() { return currentRole === 'host' ? 'w' : 'b'; },
    publishMove(gameState, expectedSeq) {
      return new Promise((resolve, reject) => {
        if (!currentRoom || !socket?.connected) return reject(new Error('Không kết nối máy chủ/phòng.'));
        socket.emit('game:move', { ...gameState, expectedSeq }, result => {
          if (!result?.ok) return resolve(false);
          resolve(true);
        });
      });
    },
    leave: leaveRoom
  };
  socket.connect();
})();

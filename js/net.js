/* =========================================================================
 * Forbidden Memory Web Clone — Networking layer (P2P via PeerJS / WebRTC)
 * Hỗ trợ 2 người chơi đấu nhau qua 2 thiết bị khác nhau (Phone / PC / Tablet)
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const Net = FM.net = {};

  const PREFIX = 'yfm-'; // Prefix ID trên PeerJS broker
  let peer = null;
  let conn = null;
  let myRoomCode = '';
  let isHosting = false;
  let isConnected = false;
  let handshakeTimer = null;
  let heartbeatTimer = null;
  let connectTimeoutTimer = null;
  let myPlayerPayload = null;

  const listeners = {
    connected: [],
    start: [],
    action: [],
    sync: [],
    disconnect: [],
    error: [],
    emoji: [],
  };

  Net.on = function (event, cb) {
    if (listeners[event]) listeners[event].push(cb);
  };

  function emit(event, data) {
    if (listeners[event]) listeners[event].forEach(fn => {
      try { fn(data); } catch (e) { console.error('Net event error:', e); }
    });
  }

  function randomCode() {
    // Mã phòng 5 chữ số dễ đọc & gõ trên điện thoại
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  function getIceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelay',
        credential: 'openrelay'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelay',
        credential: 'openrelay'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelay',
        credential: 'openrelay'
      }
    ];
  }

  const PEER_CONFIG = {
    debug: 1,
    config: {
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10,
    },
  };

  Net.isConnected = () => isConnected;
  Net.isHost = () => isHosting;
  Net.getRoomCode = () => myRoomCode;

  Net.getShareUrl = function (code) {
    const c = code || myRoomCode;
    const url = new URL(root.location.href);
    url.searchParams.set('room', c);
    return url.toString();
  };

  function stopTimers() {
    if (handshakeTimer) { clearInterval(handshakeTimer); handshakeTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (connectTimeoutTimer) { clearTimeout(connectTimeoutTimer); connectTimeoutTimer = null; }
  }

  /* ---------------- Tạo phòng (Host - Player 1) ---------------- */
  Net.createRoom = function (customCode) {
    Net.disconnect();
    isHosting = true;
    myRoomCode = customCode || randomCode();
    const peerId = PREFIX + myRoomCode;

    return new Promise((resolve, reject) => {
      try {
        peer = new root.Peer(peerId, PEER_CONFIG);
      } catch (err) {
        return reject(err);
      }

      peer.on('open', id => {
        console.log('[Net] Host room created with id:', id);
        resolve(myRoomCode);
      });

      peer.on('connection', incomingConn => {
        console.log('[Net] Incoming connection from guest');
        if (conn && conn.open) {
          // Đã có kết nối khác đang mở
          try { incomingConn.close(); } catch (e) {}
          return;
        }
        conn = incomingConn;
        setupConnection();
      });

      peer.on('disconnected', () => {
        console.warn('[Net] Peer disconnected from broker, reconnecting...');
        if (peer && !peer.destroyed) {
          try { peer.reconnect(); } catch (e) {}
        }
      });

      peer.on('error', err => {
        console.error('[Net] Peer error:', err);
        if (err.type === 'unavailable-id') {
          // Trùng mã phòng -> tự động tạo mã mới
          Net.createRoom().then(resolve).catch(reject);
        } else {
          emit('error', err);
          reject(err);
        }
      });
    });
  };

  /* ---------------- Vào phòng (Guest - Player 2) ---------------- */
  Net.joinRoom = function (code, playerPayload) {
    Net.disconnect();
    isHosting = false;
    myPlayerPayload = playerPayload || { name: 'Người chơi 2' };
    myRoomCode = String(code).trim().toLowerCase().replace(/^yfm-?/i, '');
    const targetPeerId = PREFIX + myRoomCode;

    stopTimers();
    // 20 giây timeout nếu không kết nối được
    connectTimeoutTimer = setTimeout(() => {
      if (!isConnected) {
        const err = new Error('Quá thời gian kết nối (Timeout). Vui lòng kiểm tra mã phòng hoặc thử lại.');
        emit('error', err);
        Net.disconnect();
      }
    }, 20000);

    return new Promise((resolve, reject) => {
      try {
        peer = new root.Peer(PEER_CONFIG);
      } catch (err) {
        stopTimers();
        return reject(err);
      }

      peer.on('open', myId => {
        console.log('[Net] Guest peer open, connecting to host:', targetPeerId);
        conn = peer.connect(targetPeerId, {
          reliable: true,
        });
        setupConnection();
        resolve(myRoomCode);
      });

      peer.on('disconnected', () => {
        if (peer && !peer.destroyed) {
          try { peer.reconnect(); } catch (e) {}
        }
      });

      peer.on('error', err => {
        console.error('[Net] Peer error during join:', err);
        stopTimers();
        let friendlyMsg = err.message || 'Lỗi mạng khi kết nối.';
        if (err.type === 'peer-unavailable') {
          friendlyMsg = `Không tìm thấy phòng số "${myRoomCode}". Hãy kiểm tra lại mã phòng từ Máy 1!`;
        } else if (err.type === 'network') {
          friendlyMsg = 'Lỗi kết nối mạng! Vui lòng kiểm tra kết nối Internet (Wifi/4G).';
        }
        const errorObj = new Error(friendlyMsg);
        errorObj.type = err.type;
        emit('error', errorObj);
        reject(errorObj);
      });
    });
  };

  /* ---------------- Thiết lập kết nối DataChannel ---------------- */
  function setupConnection() {
    if (!conn) return;

    const onChannelOpen = () => {
      console.log('[Net] DataChannel opened, starting handshake. Host =', isHosting);
      isConnected = true;

      if (!isHosting) {
        // Guest bắt đầu gửi HANDSHAKE liên tục cho Host đến khi Host trả lời ACK
        let tries = 0;
        if (handshakeTimer) clearInterval(handshakeTimer);
        handshakeTimer = setInterval(() => {
          if (!isConnected || tries > 20) {
            clearInterval(handshakeTimer);
            handshakeTimer = null;
            return;
          }
          tries++;
          console.log('[Net] Guest sending HANDSHAKE try #' + tries);
          try {
            conn.send({
              type: 'HANDSHAKE',
              payload: myPlayerPayload || { name: 'Người chơi 2' }
            });
          } catch (e) {}
        }, 500);
      } else {
        // Host gửi HOST_HELLO
        try {
          conn.send({ type: 'HOST_HELLO', payload: { isHost: true } });
        } catch (e) {}
      }

      // Heartbeat giữ kết nối sống (mobile sleep prevention)
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (conn && conn.open) {
          try { conn.send({ type: 'HEARTBEAT' }); } catch (e) {}
        }
      }, 8000);
    };

    if (conn.open) {
      onChannelOpen();
    } else {
      conn.on('open', onChannelOpen);
    }

    conn.on('data', rawData => {
      let data = rawData;
      if (typeof rawData === 'string') {
        try { data = JSON.parse(rawData); } catch (e) {}
      }
      if (!data || !data.type) return;

      switch (data.type) {
        case 'HEARTBEAT':
          // Keepalive - no action needed
          break;

        case 'HOST_HELLO':
          console.log('[Net] Received HOST_HELLO');
          break;

        case 'HANDSHAKE':
          // Host nhận được handshake từ Guest -> phản hồi ACK ngay
          console.log('[Net] Host received HANDSHAKE from Guest:', data.payload);
          try {
            conn.send({
              type: 'HANDSHAKE_ACK',
              payload: { name: 'Chủ phòng (P1)' }
            });
          } catch (e) {}
          stopTimers();
          emit('connected', {
            isHost: true,
            peerInfo: data.payload,
            room: myRoomCode,
          });
          break;

        case 'HANDSHAKE_ACK':
          // Guest nhận được phản hồi từ Host -> hoàn tất kết nối!
          console.log('[Net] Guest received HANDSHAKE_ACK from Host:', data.payload);
          stopTimers();
          emit('connected', {
            isHost: false,
            hostInfo: data.payload,
            room: myRoomCode,
          });
          break;

        case 'GUEST_READY':
          emit('connected', { isHost: true, peerInfo: data.payload });
          break;

        case 'START_DUEL':
          emit('start', data.payload);
          break;

        case 'DUEL_ACTION':
          emit('action', data.payload);
          break;

        case 'SYNC_STATE':
          emit('sync', data.payload);
          break;

        case 'EMOJI':
          emit('emoji', data.payload);
          break;
      }
    });

    conn.on('close', () => {
      console.warn('[Net] Connection closed');
      isConnected = false;
      stopTimers();
      emit('disconnect', {});
    });

    conn.on('error', err => {
      console.error('[Net] DataChannel error:', err);
      emit('error', err);
    });
  }

  Net.send = function (type, payload) {
    if (!conn || !isConnected) return false;
    try {
      conn.send({ type, payload });
      return true;
    } catch (e) {
      console.error('[Net] send error:', e);
      return false;
    }
  };

  Net.sendGuestReady = function (playerInfo) {
    return Net.send('GUEST_READY', playerInfo);
  };

  Net.sendStartDuel = function (duelInit) {
    return Net.send('START_DUEL', duelInit);
  };

  Net.sendAction = function (action) {
    return Net.send('DUEL_ACTION', action);
  };

  Net.syncState = function (state, fxEvents) {
    return Net.send('SYNC_STATE', { state, fx: fxEvents || [] });
  };

  Net.sendEmoji = function (emoji) {
    return Net.send('EMOJI', emoji);
  };

  Net.disconnect = function () {
    stopTimers();
    isConnected = false;
    if (conn) {
      try { conn.close(); } catch (e) {}
      conn = null;
    }
    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

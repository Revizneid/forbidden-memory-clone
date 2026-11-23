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
    ];
  }

  Net.isConnected = () => isConnected;
  Net.isHost = () => isHosting;
  Net.getRoomCode = () => myRoomCode;

  Net.getShareUrl = function (code) {
    const c = code || myRoomCode;
    const url = new URL(root.location.href);
    url.searchParams.set('room', c);
    return url.toString();
  };

  /* ---------------- Tạo phòng (Host - Player 1) ---------------- */
  Net.createRoom = function (customCode) {
    Net.disconnect();
    isHosting = true;
    myRoomCode = customCode || randomCode();
    const peerId = PREFIX + myRoomCode;

    return new Promise((resolve, reject) => {
      try {
        peer = new root.Peer(peerId, {
          debug: 1,
          config: { iceServers: getIceServers() },
        });
      } catch (err) {
        return reject(err);
      }

      peer.on('open', id => {
        resolve(myRoomCode);
      });

      peer.on('connection', incomingConn => {
        if (conn && conn.open) {
          incomingConn.close();
          return;
        }
        conn = incomingConn;
        setupConnection();
      });

      peer.on('error', err => {
        console.error('PeerJS error:', err);
        if (err.type === 'unavailable-id') {
          // Trùng mã phòng -> thử tạo mã mới
          Net.createRoom().then(resolve).catch(reject);
        } else {
          emit('error', err);
          reject(err);
        }
      });
    });
  };

  /* ---------------- Vào phòng (Guest - Player 2) ---------------- */
  Net.joinRoom = function (code) {
    Net.disconnect();
    isHosting = false;
    myRoomCode = String(code).trim().replace(/^yfm-/, '');
    const targetPeerId = PREFIX + myRoomCode;

    return new Promise((resolve, reject) => {
      try {
        peer = new root.Peer({
          debug: 1,
          config: { iceServers: getIceServers() },
        });
      } catch (err) {
        return reject(err);
      }

      peer.on('open', myId => {
        conn = peer.connect(targetPeerId, {
          reliable: true,
        });
        setupConnection();
        resolve(myRoomCode);
      });

      peer.on('error', err => {
        console.error('PeerJS join error:', err);
        emit('error', err);
        reject(err);
      });
    });
  };

  function setupConnection() {
    if (!conn) return;

    conn.on('open', () => {
      isConnected = true;
      emit('connected', { isHost: isHosting, room: myRoomCode });
    });

    conn.on('data', rawData => {
      let data = rawData;
      if (typeof rawData === 'string') {
        try { data = JSON.parse(rawData); } catch (e) {}
      }
      if (!data || !data.type) return;

      switch (data.type) {
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
      isConnected = false;
      emit('disconnect', {});
    });

    conn.on('error', err => {
      console.error('DataChannel error:', err);
      emit('error', err);
    });
  }

  Net.send = function (type, payload) {
    if (!conn || !isConnected) return false;
    try {
      conn.send({ type, payload });
      return true;
    } catch (e) {
      console.error('Net send error:', e);
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

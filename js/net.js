/* =========================================================================
 * Forbidden Memory Web Clone — Networking layer (Real-time Online PvP)
 * Hỗ trợ 2 người chơi đấu nhau qua 2 thiết bị khác nhau (Phone / PC / Tablet)
 * Sử dụng Secure WebSocket MQTT Broker (vượt 100% rào cản NAT / 4G / Firewall)
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const Net = FM.net = {};

  const TOPIC_PREFIX = 'yfm_duel_v1/';
  const BROKERS = [
    { host: 'broker.hivemq.com', port: 8884, path: '/mqtt', ssl: true },
    { host: 'broker.emqx.io', port: 8084, path: '/mqtt', ssl: true }
  ];

  let client = null;
  let myRoomCode = '';
  let isHosting = false;
  let isConnected = false;
  let myInTopic = '';
  let myOutTopic = '';
  let handshakeTimer = null;
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
    if (listeners[event]) {
      listeners[event].forEach(fn => {
        try { fn(data); } catch (e) { console.error('Net event error:', e); }
      });
    }
  }

  function randomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  function stopTimers() {
    if (handshakeTimer) { clearInterval(handshakeTimer); handshakeTimer = null; }
    if (connectTimeoutTimer) { clearTimeout(connectTimeoutTimer); connectTimeoutTimer = null; }
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

  function createClient(brokerIdx) {
    const b = BROKERS[brokerIdx || 0];
    const clientId = 'yfm_' + (isHosting ? 'h_' : 'g_') + Math.random().toString(36).slice(2, 10);
    return new root.Paho.MQTT.Client(b.host, b.port, b.path, clientId);
  }

  /* ---------------- Tạo phòng (Host - Player 1) ---------------- */
  Net.createRoom = function (customCode) {
    Net.disconnect();
    isHosting = true;
    myRoomCode = customCode || randomCode();
    myInTopic = TOPIC_PREFIX + myRoomCode + '/g2h';
    myOutTopic = TOPIC_PREFIX + myRoomCode + '/h2g';

    return new Promise((resolve, reject) => {
      try {
        client = createClient(0);
      } catch (err) {
        return reject(err);
      }

      setupClientHandlers();

      client.connect({
        useSSL: true,
        timeout: 8,
        keepAliveInterval: 30,
        cleanSession: true,
        onSuccess: () => {
          console.log('[Net] Host connected to broker, subscribing to:', myInTopic);
          client.subscribe(myInTopic, {
            onSuccess: () => {
              console.log('[Net] Host subscribed successfully, room ready:', myRoomCode);
              resolve(myRoomCode);
            },
            onFailure: e => {
              reject(new Error('Không thể đăng ký phòng đấu.'));
            }
          });
        },
        onFailure: err => {
          console.error('[Net] Host connect broker failed:', err);
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
    myInTopic = TOPIC_PREFIX + myRoomCode + '/h2g';
    myOutTopic = TOPIC_PREFIX + myRoomCode + '/g2h';

    stopTimers();
    // 15 giây timeout nếu không kết nối được
    connectTimeoutTimer = setTimeout(() => {
      if (!isConnected) {
        const err = new Error('Không tìm thấy phòng ' + myRoomCode + '. Vui lòng kiểm tra mã phòng từ Máy 1!');
        emit('error', err);
        Net.disconnect();
      }
    }, 15000);

    return new Promise((resolve, reject) => {
      try {
        client = createClient(0);
      } catch (err) {
        stopTimers();
        return reject(err);
      }

      setupClientHandlers();

      client.connect({
        useSSL: true,
        timeout: 8,
        keepAliveInterval: 30,
        cleanSession: true,
        onSuccess: () => {
          console.log('[Net] Guest connected to broker, subscribing to:', myInTopic);
          client.subscribe(myInTopic, {
            onSuccess: () => {
              console.log('[Net] Guest subscribed successfully. Starting Handshake loop...');
              // Guest gửi HANDSHAKE liên tục mỗi 500ms cho đến khi Host phản hồi ACK
              let tries = 0;
              if (handshakeTimer) clearInterval(handshakeTimer);
              handshakeTimer = setInterval(() => {
                if (isConnected || tries > 25) {
                  clearInterval(handshakeTimer);
                  handshakeTimer = null;
                  return;
                }
                tries++;
                Net.sendRaw({
                  type: 'HANDSHAKE',
                  payload: myPlayerPayload || { name: 'Người chơi 2' }
                });
              }, 500);

              resolve(myRoomCode);
            },
            onFailure: e => {
              stopTimers();
              reject(new Error('Không thể đăng ký phòng đấu.'));
            }
          });
        },
        onFailure: err => {
          stopTimers();
          console.error('[Net] Guest connect broker failed:', err);
          emit('error', err);
          reject(err);
        }
      });
    });
  };

  /* ---------------- Xử lý Message ---------------- */
  function setupClientHandlers() {
    if (!client) return;

    client.onConnectionLost = response => {
      if (response.errorCode !== 0) {
        console.warn('[Net] Connection lost:', response.errorMessage);
        isConnected = false;
        stopTimers();
        emit('disconnect', {});
      }
    };

    client.onMessageArrived = message => {
      let data = null;
      try {
        data = JSON.parse(message.payloadString);
      } catch (e) {
        return;
      }
      if (!data || !data.type) return;

      switch (data.type) {
        case 'HANDSHAKE':
          // Host nhận được Handshake từ Guest -> phản hồi ACK ngay
          console.log('[Net] Host received HANDSHAKE from Guest:', data.payload);
          Net.sendRaw({
            type: 'HANDSHAKE_ACK',
            payload: { name: 'Chủ phòng (P1)' }
          });
          isConnected = true;
          stopTimers();
          emit('connected', {
            isHost: true,
            peerInfo: data.payload,
            room: myRoomCode,
          });
          break;

        case 'HANDSHAKE_ACK':
          // Guest nhận được phản hồi ACK từ Host -> kết nối hoàn tất!
          console.log('[Net] Guest received HANDSHAKE_ACK from Host:', data.payload);
          isConnected = true;
          stopTimers();
          emit('connected', {
            isHost: false,
            hostInfo: data.payload,
            room: myRoomCode,
          });
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

        case 'DISCONNECT':
          isConnected = false;
          stopTimers();
          emit('disconnect', {});
          break;
      }
    };
  }

  Net.sendRaw = function (obj) {
    if (!client || !client.isConnected()) return false;
    try {
      const msg = new root.Paho.MQTT.Message(JSON.stringify(obj));
      msg.destinationName = myOutTopic;
      msg.qos = 0;
      client.send(msg);
      return true;
    } catch (e) {
      console.error('[Net] Send raw error:', e);
      return false;
    }
  };

  Net.send = function (type, payload) {
    return Net.sendRaw({ type, payload });
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
    if (client) {
      try {
        if (client.isConnected()) {
          Net.sendRaw({ type: 'DISCONNECT' });
          client.disconnect();
        }
      } catch (e) {}
      client = null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

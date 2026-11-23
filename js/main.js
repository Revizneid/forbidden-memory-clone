/* =========================================================================
 * Forbidden Memory Web Clone — bootstrap & wiring
 * ========================================================================= */
(function () {
  'use strict';
  const FM = window.FM, UI = FM.ui;
  const $ = id => document.getElementById(id);

  window.addEventListener('DOMContentLoaded', () => {
    UI.buildMenu();
    UI.showMenu();
    // Có trận đang đánh dở (F5/tab reload) → khôi phục lại
    if (!UI.restoreDuel()) {
      // xoá dữ liệu trận cũ nếu không khôi phục được
      try { localStorage.removeItem('fm_duel_v1'); } catch (e) {}
    }

    // Game Mode Tabs
    const tabAi = $('tab-mode-ai');
    if (tabAi) tabAi.onclick = () => UI.setGameMode('ai');
    const tabOnline = $('tab-mode-online');
    if (tabOnline) tabOnline.onclick = () => UI.setGameMode('online');
    const tab2p = $('tab-mode-2p');
    if (tab2p) tab2p.onclick = () => UI.setGameMode('2p');

    // Menu actions
    $('btn-start').onclick = () => {
      localStorage.removeItem('fm_duel_v1');
      FM.ui.startDuel(FM.ui.getSelectedConfig());
    };
    const btnStart2p = $('btn-start-2p');
    if (btnStart2p) {
      btnStart2p.onclick = () => {
        localStorage.removeItem('fm_duel_v1');
        FM.ui.startDuel(FM.ui.getSelectedConfig());
      };
    }
    $('btn-menu-help').onclick = () => UI.showHelp();
    const btnMenuDeck = $('btn-menu-deck');
    if (btnMenuDeck) btnMenuDeck.onclick = () => UI.showDeckEditor();
    const btnMenuShop = $('btn-menu-shop');
    if (btnMenuShop) btnMenuShop.onclick = () => UI.showCardShop();
    const btnEditDeck = $('btn-edit-current-deck');
    if (btnEditDeck) btnEditDeck.onclick = () => UI.showDeckEditor();
    const btnEditP1Deck = $('btn-edit-p1-deck');
    if (btnEditP1Deck) btnEditP1Deck.onclick = () => UI.showDeckEditor();
    const btnEditOnlineDeck = $('btn-edit-online-deck');
    if (btnEditOnlineDeck) btnEditOnlineDeck.onclick = () => UI.showDeckEditor();

    /* ---------------- Online Multiplayer Wiring ---------------- */
    let guestPlayerInfo = null;
    const btnCreateRoom = $('btn-create-room');
    if (btnCreateRoom && FM.net) {
      btnCreateRoom.onclick = async () => {
        btnCreateRoom.disabled = true;
        btnCreateRoom.textContent = '⏳ Đang tạo phòng...';
        const hStatus = $('host-status');
        const hText = $('host-status-text');
        const hDot = hStatus ? hStatus.querySelector('.status-dot') : null;
        if (hDot) hDot.className = 'status-dot pulsing';
        if (hText) hText.textContent = 'Đang chờ người chơi 2 kết nối...';
        const btnStart = $('btn-start-online');
        if (btnStart) btnStart.classList.add('hidden');
        guestPlayerInfo = null;
        try {
          const code = await FM.net.createRoom();
          $('host-room-code').textContent = code;
          $('host-room-info').classList.remove('hidden');
          btnCreateRoom.textContent = '🔄 Đổi Mã Phòng Mới';
          btnCreateRoom.disabled = false;
        } catch (err) {
          if (hDot) hDot.className = 'status-dot error';
          if (hText) hText.textContent = 'Lỗi tạo phòng: ' + (err.message || err);
          btnCreateRoom.disabled = false;
          btnCreateRoom.textContent = 'Tạo Phòng Mới';
        }
      };
    }

    const btnCopyCode = $('btn-copy-code');
    if (btnCopyCode) {
      btnCopyCode.onclick = () => {
        const code = $('host-room-code').textContent;
        navigator.clipboard.writeText(code).then(() => {
          btnCopyCode.textContent = '✅ Đã Copy!';
          setTimeout(() => { btnCopyCode.textContent = '📋 Copy Mã'; }, 1500);
        });
      };
    }

    const btnCopyLink = $('btn-copy-link');
    if (btnCopyLink && FM.net) {
      btnCopyLink.onclick = () => {
        const link = FM.net.getShareUrl();
        navigator.clipboard.writeText(link).then(() => {
          btnCopyLink.textContent = '✅ Đã Copy Link Mời Đấu!';
          setTimeout(() => { btnCopyLink.textContent = '🔗 Copy Link Mời Đấu'; }, 1500);
        });
      };
    }

    const btnJoinRoom = $('btn-join-room');
    if (btnJoinRoom && FM.net) {
      btnJoinRoom.onclick = async () => {
        const input = $('input-room-code');
        const code = input ? input.value.trim() : '';
        if (!code) { alert('Vui lòng nhập mã phòng!'); return; }
        const jStatus = $('join-status');
        const jText = $('join-status-text');
        const jDot = jStatus ? jStatus.querySelector('.status-dot') : null;
        if (jStatus) jStatus.classList.remove('hidden');
        if (jDot) jDot.className = 'status-dot pulsing';
        if (jText) jText.textContent = 'Đang kết nối tới phòng ' + code + '...';
        btnJoinRoom.disabled = true;
        try {
          const myDeck = UI.getOnlineDeck();
          await FM.net.joinRoom(code, {
            name: 'Người chơi 2 (Bạn)',
            deck: myDeck,
          });
        } catch (err) {
          if (jDot) jDot.className = 'status-dot error';
          if (jText) jText.textContent = 'Lỗi kết nối: ' + (err.message || err);
          btnJoinRoom.disabled = false;
        }
      };
    }

    const btnStartOnline = $('btn-start-online');
    if (btnStartOnline) {
      btnStartOnline.onclick = () => {
        if (!guestPlayerInfo) { alert('Chưa có người chơi 2 tham gia!'); return; }
        const p0deck = UI.getOnlineDeck();
        const p1deck = guestPlayerInfo.deck || FM.decks.DECKS.dragonMaster.list;
        UI.startOnlineDuelAsHost(p0deck, p1deck, guestPlayerInfo.name);
      };
    }

    if (FM.net) {
      FM.net.on('connected', data => {
        if (data.isHost) {
          guestPlayerInfo = data.peerInfo;
          const hStatus = $('host-status');
          const hDot = hStatus ? hStatus.querySelector('.status-dot') : null;
          const hText = $('host-status-text');
          if (hDot) hDot.className = 'status-dot ready';
          if (hText) hText.textContent = `✅ ${data.peerInfo?.name || 'Người chơi 2'} đã kết nối thành công!`;
          if (btnStartOnline) {
            btnStartOnline.classList.remove('hidden');
            btnStartOnline.focus();
          }
        } else {
          const jStatus = $('join-status');
          const jDot = jStatus ? jStatus.querySelector('.status-dot') : null;
          const jText = $('join-status-text');
          if (jStatus) jStatus.classList.remove('hidden');
          if (jDot) jDot.className = 'status-dot ready';
          if (jText) jText.textContent = '✅ Đã vào phòng thành công! Đang chờ Chủ phòng bắt đầu ván đấu...';
        }
      });

      FM.net.on('error', err => {
        console.error('[Main] FM.net error:', err);
        const jStatus = $('join-status');
        const jDot = jStatus ? jStatus.querySelector('.status-dot') : null;
        const jText = $('join-status-text');
        if (jStatus) jStatus.classList.remove('hidden');
        if (jDot) jDot.className = 'status-dot error';
        if (jText) jText.textContent = '⚠️ ' + (err.message || err);
        if (btnJoinRoom) btnJoinRoom.disabled = false;

        const hStatus = $('host-status');
        const hDot = hStatus ? hStatus.querySelector('.status-dot') : null;
        const hText = $('host-status-text');
        if (hDot) hDot.className = 'status-dot error';
        if (hText) hText.textContent = '⚠️ ' + (err.message || err);
        if (btnCreateRoom) btnCreateRoom.disabled = false;
      });

      FM.net.on('start', payload => UI.startOnlineDuelAsGuest(payload));
      FM.net.on('action', action => UI.onRemoteAction(action));
      FM.net.on('sync', payload => UI.onRemoteSync(payload));
      FM.net.on('emoji', em => UI.showFloatingEmoji(em, false));
      FM.net.on('disconnect', () => {
        alert('⚠️ Đối thủ đã ngắt kết nối hoặc phòng đã đóng!');
        UI.showMenu();
        if (btnJoinRoom) btnJoinRoom.disabled = false;
        if (btnCreateRoom) btnCreateRoom.disabled = false;
      });
    }

    // Reaction emojis
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.onclick = () => {
        const emoji = btn.dataset.e;
        if (FM.net && UI.isOnline) FM.net.sendEmoji(emoji);
        UI.showFloatingEmoji(emoji, true);
      };
    });

    // Tự động vào phòng khi link có ?room=XXXX
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      if (roomParam) {
        UI.setGameMode('online');
        const inp = $('input-room-code');
        if (inp) inp.value = roomParam;
        setTimeout(() => {
          if (btnJoinRoom) btnJoinRoom.click();
        }, 600);
      }
    } catch (e) {}

    // Topbar buttons
    $('btn-fusionlist').onclick = () => UI.showFusionTable();
    $('btn-help').onclick = () => UI.showHelp();
    $('btn-mute').onclick = () => { const m = UI.toggleMute(); $('btn-mute').textContent = m ? '🔇' : '🔊'; };
    $('btn-quit').onclick = () => { if (confirm('Rời trận và về menu?')) UI.showMenu(); };

    // Phase bar
    $('btn-battle').addEventListener('click', () => UI.handlePhaseAction('battle'));
    $('btn-endturn').addEventListener('click', () => UI.handlePhaseAction('endturn'));
    $('btn-togglelog').onclick = () => {
      const lp = $('log-panel');
      lp.classList.toggle('hidden');
      $('btn-togglelog').textContent = lp.classList.contains('hidden') ? '📜' : '📜✖';
    };

    // Mobile drawer sidebar
    const btnCloseSb = $('btn-close-sidebar');
    if (btnCloseSb) btnCloseSb.onclick = () => UI.closeSidebarMobile();
    const sbBackdrop = $('sidebar-backdrop');
    if (sbBackdrop) sbBackdrop.onclick = () => UI.closeSidebarMobile();

    // Esc = hủy thao tác đang làm
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') {
        const ov = $('overlay');
        if (!ov.classList.contains('hidden')) { ov.classList.add('hidden'); ov.innerHTML = ''; }
        UI.closeSidebarMobile();
      }
    });

    console.log('%cFORBIDDEN MEMORY — Web Clone sẵn sàng! 🐉', 'color:#d4af37;font-size:14px;font-weight:bold');
  });
})();

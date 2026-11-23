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

    // Menu actions
    $('btn-start').onclick = () => {
      localStorage.removeItem('fm_duel_v1');
      FM.ui.startDuel(FM.ui.getSelectedConfig());
    };
    $('btn-menu-help').onclick = () => UI.showHelp();
    const btnMenuDeck = $('btn-menu-deck');
    if (btnMenuDeck) btnMenuDeck.onclick = () => UI.showDeckEditor();
    const btnMenuShop = $('btn-menu-shop');
    if (btnMenuShop) btnMenuShop.onclick = () => UI.showCardShop();
    const btnEditDeck = $('btn-edit-current-deck');
    if (btnEditDeck) btnEditDeck.onclick = () => UI.showDeckEditor();

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

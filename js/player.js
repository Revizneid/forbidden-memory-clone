/* =========================================================================
 * Forbidden Memory Web Clone — Player Profile & Duel Drop Engine
 * Quản lý: Profile tài khoản, Avatar, Rank, Trunk (Rương bài), Custom Deck, Star Chips, Duel Drops.
 * Lưu trữ: localStorage ('fm_player_v2').
 * ========================================================================= */
(function (root) {
  'use strict';
  const FM = root.FM = root.FM || {};
  const C = FM.cards;

  const STORAGE_KEY = 'fm_player_v2';
  let profile = null;

  function cardKeyOf(c) {
    if (!c) return null;
    if (typeof c === 'string' || typeof c === 'number') return String(c);
    if (c.kind === 'MONSTER') return String(c.id);
    if (c.kind === 'MAGIC') return c.mid;
    if (c.kind === 'TRAP') return c.tid;
    return null;
  }

  /* Khởi tạo profile ban đầu: Random 1 trong 4 deck mẫu, Rương hoàn toàn rỗng */
  function initDefaultProfile() {
    const starterDeckKeys = ['flameSwordsman', 'dragonMaster', 'shadowLegion', 'stormMachine'];
    const chosenKey = starterDeckKeys[Math.floor(Math.random() * starterDeckKeys.length)];
    const mainDeckList = FM.decks.DECKS[chosenKey].list;
    const starterDeck = FM.decks.expandDeck(mainDeckList);

    profile = {
      version: 2,
      name: 'Yugi Muto',
      avatar: '👑',
      starterDeckKey: chosenKey,
      stars: 50,
      deck: starterDeck,
      trunk: {}, // Khởi đầu Rương không có gì
      stats: { wins: 0, losses: 0, drops: 0 },
      ranks: { S: 0, A: 0, B: 0, C: 0, D: 0 },
      createdAt: Date.now(),
    };
    saveProfile();
    return profile;
  }

  function loadProfile() {
    if (profile) return profile;
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          profile = JSON.parse(raw);
          if (profile.version !== 2 || !profile.deck || !Array.isArray(profile.deck) || profile.deck.length !== 40) {
            return initDefaultProfile();
          }
          if (!profile.trunk || typeof profile.trunk !== 'object') profile.trunk = {};
          if (profile.stars == null) profile.stars = 50;
          if (!profile.name) profile.name = 'Yugi Muto';
          if (!profile.avatar) profile.avatar = '👑';
          if (!profile.stats) profile.stats = { wins: 0, losses: 0, drops: 0 };
          if (!profile.ranks) profile.ranks = { S: 0, A: 0, B: 0, C: 0, D: 0 };
          return profile;
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc player profile, khởi tạo lại:', e);
    }
    return initDefaultProfile();
  }

  function saveProfile() {
    if (!profile) return;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      }
    } catch (e) {
      console.warn('Không thể lưu profile vào localStorage:', e);
    }
  }

  const Player = FM.player = {
    getProfile() {
      return loadProfile();
    },

    getName() {
      return loadProfile().name || 'Yugi Muto';
    },

    setName(name) {
      const p = loadProfile();
      p.name = String(name || '').trim().slice(0, 20) || 'Yugi Muto';
      saveProfile();
      return p.name;
    },

    getAvatar() {
      return loadProfile().avatar || '👑';
    },

    setAvatar(avatar) {
      const p = loadProfile();
      p.avatar = avatar || '👑';
      saveProfile();
      return p.avatar;
    },

    getTitle() {
      const p = loadProfile();
      const wins = p.stats ? p.stats.wins : 0;
      if (wins >= 50) return 'Vua Trò Chơi (King of Games)';
      if (wins >= 30) return 'Bậc Thầy Dung Hợp (Fusion Master)';
      if (wins >= 15) return 'Chiến Binh Đấu Trường';
      if (wins >= 5) return 'Bài Thủ Triển Vọng';
      return 'Học Viên Bài Thủ (Rookie)';
    },

    getUniqueCardCount() {
      const p = loadProfile();
      const uniqueKeys = new Set();
      // Quét trong deck
      for (const c of p.deck) {
        const k = cardKeyOf(c);
        if (k) uniqueKeys.add(k);
      }
      // Quét trong trunk
      for (const k in p.trunk) {
        if (p.trunk[k] > 0) uniqueKeys.add(k);
      }
      const count = uniqueKeys.size;
      const total = 722;
      const percent = Math.min(100, Math.round((count / total) * 1000) / 10);
      return { count, total, percent };
    },

    getStars() {
      return loadProfile().stars;
    },

    addStars(amount) {
      const p = loadProfile();
      p.stars = Math.max(0, p.stars + amount);
      saveProfile();
      return p.stars;
    },

    spendStars(amount) {
      const p = loadProfile();
      if (p.stars < amount) return false;
      p.stars -= amount;
      saveProfile();
      return true;
    },

    getDeck() {
      return loadProfile().deck;
    },

    getTrunk() {
      return loadProfile().trunk;
    },

    totalOwned(ref) {
      const key = cardKeyOf(ref);
      if (!key) return 0;
      const p = loadProfile();
      const inTrunk = p.trunk[key] || 0;
      const inDeck = p.deck.filter(c => cardKeyOf(c) === key).length;
      return inTrunk + inDeck;
    },

    addCardToTrunk(ref) {
      const key = cardKeyOf(ref);
      if (!key) return false;
      const p = loadProfile();
      p.trunk[key] = (p.trunk[key] || 0) + 1;
      saveProfile();
      return true;
    },

    saveDeck(newDeck, newTrunk) {
      const p = loadProfile();
      if (!Array.isArray(newDeck) || newDeck.length !== 40) {
        return { ok: false, msg: 'Bộ bài thi đấu phải có đúng 40 lá!' };
      }
      const counts = {};
      for (const card of newDeck) {
        const k = cardKeyOf(card);
        counts[k] = (counts[k] || 0) + 1;
        if (counts[k] > 3) {
          const cd = C.cardData(card);
          const name = cd && cd.data ? cd.data.name : k;
          return { ok: false, msg: `Lá "${name}" vượt quá giới hạn 3 bản sao trong deck!` };
        }
      }
      p.deck = newDeck;
      if (newTrunk) p.trunk = newTrunk;
      saveProfile();
      return { ok: true };
    },

    resetDeckToPreset(presetKey) {
      const preset = FM.decks.DECKS[presetKey] || FM.decks.DECKS.flameSwordsman;
      const p = loadProfile();
      for (const c of p.deck) {
        const k = cardKeyOf(c);
        p.trunk[k] = (p.trunk[k] || 0) + 1;
      }
      const targetDeck = FM.decks.expandDeck(preset.list);
      for (const c of targetDeck) {
        const k = cardKeyOf(c);
        if (p.trunk[k] && p.trunk[k] > 0) {
          p.trunk[k]--;
        }
      }
      p.deck = targetDeck;
      saveProfile();
      return { ok: true, deck: p.deck };
    },

    buyCard(ref) {
      const cd = C.cardData(ref);
      if (!cd || !cd.data) return { ok: false, msg: 'Thẻ không hợp lệ!' };
      const cost = cd.data.cost || 50;
      const p = loadProfile();
      if (p.stars < cost) {
        return { ok: false, msg: `Không đủ Star Chips! Cần ⭐ ${cost}, bạn chỉ có ⭐ ${p.stars}.` };
      }
      p.stars -= cost;
      p.trunk[cd.key] = (p.trunk[cd.key] || 0) + 1;
      saveProfile();
      return { ok: true, stars: p.stars, card: cd };
    },

    /* Ghi nhận kết quả trận đấu (cả AI và Online) */
    recordDuelMatch(won, rank, starsWon) {
      const p = loadProfile();
      if (won) {
        p.stats.wins++;
        if (rank && p.ranks) {
          p.ranks[rank] = (p.ranks[rank] || 0) + 1;
        }
        if (starsWon) p.stars += starsWon;
      } else {
        p.stats.losses++;
      }
      saveProfile();
    },

    calculateDuelReward(s, duelist) {
      const p = loadProfile();
      if (s.winner !== 0) {
        p.stats.losses++;
        saveProfile();
        return { won: false, rank: 'F', starsWon: 0, dropCard: null };
      }

      // 1. Tính Rank chiến thắng
      const myLp = s.players[0].lp;
      const turns = s.turnNo;
      let rank = 'B';
      let stars = 3;

      if (myLp >= 6000 && turns <= 10) {
        rank = 'S';
        stars = 5;
      } else if (myLp >= 4000 || turns <= 15) {
        rank = 'A';
        stars = 4;
      } else if (myLp >= 2000) {
        rank = 'B';
        stars = 3;
      } else if (turns > 30 || myLp < 1500) {
        rank = 'C';
        stars = 2;
      } else {
        rank = 'D';
        stars = 1;
      }

      // 2. Ăn bài đối thủ (Drop 1 lá ngẫu nhiên từ Deck đối thủ)
      let dropCard = null;
      if (duelist && Array.isArray(duelist.deck) && duelist.deck.length > 0) {
        const expandedEnemyDeck = FM.decks.expandDeck(duelist.deck);
        const pickIdx = Math.floor(Math.random() * expandedEnemyDeck.length);
        const rawDrop = expandedEnemyDeck[pickIdx];
        const cd = C.cardData(rawDrop);
        if (cd) {
          dropCard = cd;
          const k = cd.key;
          p.trunk[k] = (p.trunk[k] || 0) + 1;
        }
      }

      // Cập nhật profile
      p.stars += stars;
      p.stats.wins++;
      p.stats.drops++;
      if (p.ranks) p.ranks[rank] = (p.ranks[rank] || 0) + 1;
      saveProfile();

      return {
        won: true,
        rank,
        starsWon: stars,
        totalStars: p.stars,
        dropCard,
        duelistName: duelist ? duelist.name : 'Đối thủ',
      };
    },

    /* Xuất dữ liệu sao lưu (JSON string) */
    exportSaveData() {
      const p = loadProfile();
      let unlock = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('fm_unlock_v1');
          if (raw) unlock = JSON.parse(raw);
        }
      } catch (e) {}
      return JSON.stringify({
        player: p,
        unlock: unlock,
        exportedAt: new Date().toISOString(),
      });
    },

    /* Nhập dữ liệu sao lưu */
    importSaveData(jsonStr) {
      try {
        const data = JSON.parse(jsonStr);
        if (!data || !data.player || !Array.isArray(data.player.deck) || data.player.deck.length !== 40) {
          return { ok: false, msg: 'Dữ liệu sao lưu không hợp lệ hoặc bị hỏng!' };
        }
        profile = data.player;
        profile.version = 2;
        saveProfile();
        if (typeof localStorage !== 'undefined' && Array.isArray(data.unlock)) {
          localStorage.setItem('fm_unlock_v1', JSON.stringify(data.unlock));
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: 'Lỗi đọc mã sao lưu: ' + e.message };
      }
    },

    /* Reset toàn bộ tiến trình game */
    resetProfile() {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem('fm_unlock_v1');
          localStorage.removeItem('fm_duel_v1');
        }
      } catch (e) {}
      profile = null;
      return initDefaultProfile();
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Player;
  }
})(typeof window !== 'undefined' ? window : globalThis);

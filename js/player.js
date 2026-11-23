/* =========================================================================
 * Forbidden Memory Web Clone — Player Profile & Duel Drop Engine
 * Quản lý: Trunk (Rương bài), Custom Deck (40 lá), Star Chips, Duel Drops.
 * Lưu trữ: localStorage ('fm_player_v1').
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
      starterDeckKey: chosenKey,
      stars: 50,
      deck: starterDeck,
      trunk: {}, // Khởi đầu Rương không có gì
      stats: { wins: 0, losses: 0, drops: 0 },
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
          if (!profile.stats) profile.stats = { wins: 0, losses: 0, drops: 0 };
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

    /* Đếm tổng số lượng 1 lá sở hữu (trong deck + trong trunk) */
    totalOwned(ref) {
      const key = cardKeyOf(ref);
      if (!key) return 0;
      const p = loadProfile();
      const inTrunk = p.trunk[key] || 0;
      const inDeck = p.deck.filter(c => cardKeyOf(c) === key).length;
      return inTrunk + inDeck;
    },

    /* Thêm lá bài vào Trunk (nhận thưởng hoặc mua) */
    addCardToTrunk(ref) {
      const key = cardKeyOf(ref);
      if (!key) return false;
      const p = loadProfile();
      p.trunk[key] = (p.trunk[key] || 0) + 1;
      saveProfile();
      return true;
    },

    /* Lưu bộ bài sau khi chỉnh sửa */
    saveDeck(newDeck, newTrunk) {
      const p = loadProfile();
      if (!Array.isArray(newDeck) || newDeck.length !== 40) {
        return { ok: false, msg: 'Bộ bài thi đấu phải có đúng 40 lá!' };
      }
      // Kiểm tra tối đa 3 bản sao mỗi lá
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

    /* Đặt lại bộ bài theo 1 trong các Deck mẫu có sẵn */
    resetDeckToPreset(presetKey) {
      const preset = FM.decks.DECKS[presetKey] || FM.decks.DECKS.flameSwordsman;
      const p = loadProfile();
      // Thu hồi toàn bộ bài trong deck hiện tại về trunk
      for (const c of p.deck) {
        const k = cardKeyOf(c);
        p.trunk[k] = (p.trunk[k] || 0) + 1;
      }
      // Trích xuất các lá của preset từ trunk (hoặc bổ sung nếu thiếu)
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

    /* Mua bài từ Card Shop */
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

    /* Tính phần thưởng sau trận (Ăn bài đối thủ + Star Chips) */
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

      // 2. Ăn bài đối thủ (Drop 1 lá ngẫu nhiên từ Deck đối thủ vừa hạ gục)
      let dropCard = null;
      if (duelist && Array.isArray(duelist.deck) && duelist.deck.length > 0) {
        const expandedEnemyDeck = FM.decks.expandDeck(duelist.deck);
        // Ưu tiên chọn ngẫu nhiên bài trong deck đối thủ
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
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Player;
  }
})(typeof window !== 'undefined' ? window : globalThis);


# 🐉 Forbidden Memory — Web Clone

Clone web game lấy cảm hứng từ **Yu-Gi-Oh! Forbidden Memories (PS1, 1999)**: đấu bài 3×3, LP 8000, và hệ thống **FUSION** huyền thoại — chơi trực tiếp với **máy (AI)** trong trình duyệt.

> 🎮 **Chơi online:** [https://forbidden-memory.vercel.app](https://forbidden-memory.vercel.app)
> 📦 **Source:** [github.com/Revizneid/forbidden-memory-clone](https://github.com/Revizneid/forbidden-memory-clone) — push lên `main` tự động deploy lại Vercel.

> Fan-made, không dùng ảnh/tài nguyên gốc — toàn bộ vẽ bằng CSS + emoji, âm thanh sinh bằng WebAudio.

---

## ▶ Cách chạy

Cách 1 — chơi bản online (không cần cài gì): mở https://forbidden-memory.vercel.app

Cách 2 — server local kèm game (gửi `no-cache` nên luôn mới nhất):

```bash
cd yugioh-fm-clone
python serve.py
# mở http://127.0.0.1:8619/
```

Cách 2 — `python -m http.server 8619` (nếu trình duyệt cache cũ, thêm `?v=1` vào URL).
Cách 3 — mở thẳng `index.html` trong trình duyệt (không cần build).

## ✨ Hiệu ứng & môi trường (mới)

- **Đấu trường theo đối thủ**: 9 arena theme (đền thờ, đồng cỏ, núi lửa, vực sâu, tháp pháp sư, bầu trời, nghĩa địa, bóng tối…).
- **Địa hình biến đổi môi trường**: chơi Umi/Forest/Mountain/Yami/Sogen → cả sân đổi sắc + hiệu ứng thời tiết canvas (bong bóng nổi, lá rơi, sấm chớp, sương tối, cát bay).
- **Hiệu ứng phép**: Raigeki (tia sét giật + flash), Dark Hole (vortex hút xoáy), Fissure (vết nứt mặt đất), Dian Keto (tim xanh nảy), trang bị (sparkle + icon bay lên quái).
- **Hiệu ứng bẫy**: lật mặt bẫy, Trap Hole (hố đen nuốt quái), Widespread Ruin (tên lửa nổ), Just Desserts (mưa 🍮 xuống LP), Dragon Capture Jar (xiềng xích vàng), Anti Raigeki (vòm khiên phản sét).
- **Đánh nhau**: quái lao tới, burst particle theo attribute, ring xung kích, screen-shake theo sát thương, direct attack bắn comet vào LP, summon boss (ATK ≥ 2400) có trụ sáng + dim sân.
- **Hiển thị quái**: ATK/DEF **hiệu dụng** trên thẻ sân (equip/địa hình làm xanh/đỏ tức thì), badge ⚔ATK/🛡DEF, bài chơi được trên tay viền sáng, banner chuyển lượt.
- **F5-proof**: trận đang đánh tự lưu + khôi phục khi reload trang.

## 🎮 Luật chơi (tóm tắt)

- Mỗi bên **LP 8000**, lưới quái **3×3**, tay tối đa **5 bài**. **Draw Phase** rút 1 bài ở ĐẦU mỗi lượt — tay đầy 5/5 thì bỏ lượt rút (luật FM gốc: chơi bớt bài mới rút được).
- **Main Phase**: triệu hồi quái (không giới hạn số lần/lượt), set úp (phòng thủ), fusion, dùng phép, set bẫy, đổi tư thế.
- **Battle Phase**: mỗi quái ATK ngửa đánh 1 lần. Quái đánh **quái cùng cột phía đối diện** (ưu tiên gần nhất) — cột trống thì **đánh thẳng LP**. Quái úp là tường chắn cột.
- Sát thương kiểu cũ: ATK vs ATK — bên thua bị phá + mất chênh lệch LP; ATK vs DEF — xuyên được thì phá tường, không xuyên thì attacker mất (DEF − ATK) LP.
- **Fusion** (đặc trưng của FM):
  - 2 quái trên tay, hoặc quái trên sân + bài tay → quái mới triệu hồi/thay thế tại chỗ.
  - **Cùng hệ (race)** thường hợp nhất được → nâng cấp theo bậc (ladder).
  - Nhiều **công thức đặc biệt**: Flame Manipulator + Masaki = **Flame Swordsman**, Curse of Dragon + Gaia = **Gaia the Dragon Champion**, Red-Eyes + Summoned Skull = **B. Skull Dragon**, Blue-Eyes + Blue-Eyes = **Ultimate Dragon**… (xem nút 🧪 trong game — hơn 60 công thức).
- **Phép**: Dark Hole, Raigeki, Fissure, Dian Keto, trang bị (Dark Energy, Salamandra…), địa hình (Mountain, Yami, Umi…) buff toàn trận theo hệ.
- **Bẫy**: set úp, tự kích hoạt — Trap Hole, Widespread Ruin, Just Desserts, Dragon Capture Jar, Anti Raigeki.
- Thắng khi LP đối thủ về 0. Thua nếu **hết deck**. Sau **lượt 100**, ai LP thấp hơn thua (chống bế tắc).

## 🤖 Chơi với máy

- **9 đối thủ** theo phong cách campaign FM: Simon Muran → Tea → Tư Tế Điện Ngọc → Đại Tư Tế Kepura → Pháp Sư Bóng Tối → Seto 1st → Đại Tư Tế Martis → Tử Linh Sư → **DarkNite** (boss).
- Mỗi đối thủ có deck + tính cách riêng (Seto chơi rồng, Tử Linh Sư chơi zombie/fiend…).
- **5 độ khó** AI: Dễ → Ác mã (AI biết tìm fusion, giữ tường, đánh trực tiếp khi cột trống, all-in khi đủ sát thương lethal).
- Tiến độ (đã hạ ai) **lưu tự động** trong `localStorage`.
- 4 deck người chơi: Kiếm Sĩ Hỏa, Chúa Tể Rồng, Quân Đoàn Bóng Tối, Sấm Sét & Máy Móc.

## 🧪 Kiểm thử

```bash
node test/engine_test.js
```

- Unit check bảng fusion + deck.
- **200 ván AI vs AI** stress test (mọi deck × mọi độ khó): không crash, mọi ván kết thúc, LP >= 0, tay <= 5.
- Smoke test fusion trong duel thật.

Kết quả chuẩn: `ALL TESTS PASSED ✓` (200 games, 0 timeout).

## 🎴 Trọn bộ 722 lá FM gốc & Cơ chế mới

- **Đầy đủ 722 lá bài chuẩn FM PS1**: 621 quái vật, 67 phép & trang bị, 10 bẫy, 24 nghi thức (Ritual) và **24.956 công thức fusion thật** trích xuất từ database gốc.
- **Guardian Star (Ngôi sao Hộ mệnh)**: 10 chòm sao chia làm 2 chu kỳ tương khắc chuẩn FM:
  - Chu kỳ 1: *Sun ☀️ > Moon 🌙 > Venus ♀ > Mercury ☿ > Sun ☀️*
  - Chu kỳ 2: *Mars ♂ > Jupiter ♃ > Saturn ♄ > Uranus ♅ > Pluto ♇ > Neptune ♆ > Mars ♂*
  - Quái vật mang Guardian Star khắc chế đối thủ được **+500 ATK/DEF** ngay trong giao tranh! Có thể chủ động chuyển đổi giữa 2 sao của quái trên sân.
- **Triệu hồi Nghi thức (Ritual Summon)**: Hi sinh đúng 3 nguyên liệu (trên tay hoặc trên sân) để triệu hồi các quái thú tối thượng (Gate Guardian, Black Luster Soldier, Magician of Black Chaos...).
- **Bẫy & Hiệu ứng đặc biệt**: Bẫy phản đòn (Bear Trap, Acid Trap Hole, Widespread Ruin, Just Desserts, Bad Reaction to Simochi phản hồi máu thành sát thương...).

## 📂 Cấu trúc

```
yugioh-fm-clone/
├── index.html          # Khung trang game
├── serve.py            # Server no-cache (khuyến nghị khi chạy local)
├── css/style.css       # Giao diện PS1-dark, thẻ CSS-drawn, arena themes, FX overlays
├── js/
│   ├── cards_full.js   # Database 722 lá FM gốc + 24.956 fusion (sinh tự động)
│   ├── cards.js        # Loader DB + Guardian Star + deck presets + tương khắc
│   ├── engine.js       # State machine trận đấu: Guardian Star, Ritual, Spell/Trap dispatch, Battle
│   ├── ai.js           # AI đối thủ tối ưu cho 722 lá + Ritual + Equip + Trap
│   ├── fx.js           # Canvas FX engine: particle, lightning, vortex, arena/terrain ambience, shake
│   ├── ui.js           # Render UI, chọn Guardian Star, xác nhận Ritual, Fusion modal, âm thanh
│   └── main.js         # Wiring menu + khởi tạo
├── scripts/
│   └── build_cards.js  # Script sinh cards_full.js từ raw database
└── test/
    ├── engine_test.js  # Test tự động: DB verification, 200 ván AI vs AI, Ritual smoke, Star battle
    └── debug_flow.js   # Script debug flow trận đấu
```

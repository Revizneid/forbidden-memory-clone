#!/usr/bin/env python3
"""
Tách và cắt size phù hợp từ ảnh nguồn trong assets/sources/
để tạo ảnh lá bài thay thế từ 001 đến 019 trong assets/cards/.

Nguồn:
  - assets/sources/001.png      -> assets/cards/1.png
  - assets/sources/002-010.png  -> assets/cards/2.png .. 10.png (lưới 3x3)
  - assets/sources/011-019.png  -> assets/cards/11.png .. 19.png (lưới 3x3)
"""

from pathlib import Path
import numpy as np
from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
SOURCES_DIR = PROJECT_DIR / "assets" / "sources"
ASSETS_DIR = PROJECT_DIR / "assets" / "cards"

TARGET_WIDTH = 480


def find_grid_bounds(arr, count=3):
    """Tìm tọa độ ranh giới cắt (start, end) cho từng hàng/cột dựa trên rãnh tối."""
    h, w, _ = arr.shape
    row_mean = arr.mean(axis=(1, 2))
    col_mean = arr.mean(axis=(0, 2))

    def split_axis(profile, length):
        step = length / count
        cuts = []
        # Rãnh đầu và cuối
        s0 = int(np.argmin(profile[:20]))
        s_end = length - 20 + int(np.argmin(profile[length - 20:]))
        cuts.append(s0)
        for i in range(1, count):
            center = int(round(i * step))
            lo = max(0, center - 20)
            hi = min(length, center + 20)
            cuts.append(lo + int(np.argmin(profile[lo:hi])))
        cuts.append(s_end)

        # Thu gọn nhẹ 2px mỗi mép để loại bỏ đường viền đen ngăn cách
        bounds = []
        for i in range(count):
            a = min(length - 1, cuts[i] + 2)
            b = max(a + 1, cuts[i + 1] - 2)
            bounds.append((a, b))
        return bounds

    return split_axis(row_mean, h), split_axis(col_mean, w)


def process_single_001():
    src = SOURCES_DIR / "001.png"
    im = Image.open(src).convert("RGB")
    w, h = im.size
    # Giữ tỷ lệ chuẩn 5:7 (480x672) bằng cách cắt bớt phần viền thừa nhẹ trên/dưới nếu cần
    target_h = 672
    scaled_h = int(round(h * TARGET_WIDTH / w))
    im = im.resize((TARGET_WIDTH, scaled_h), Image.Resampling.LANCZOS)
    if scaled_h > target_h:
        top = (scaled_h - target_h) // 2
        im = im.crop((0, top, TARGET_WIDTH, top + target_h))
    out = ASSETS_DIR / "1.png"
    im.save(out, "PNG", optimize=True)
    print(f"Saved {out.name} ({im.size[0]}x{im.size[1]}) from {src.name}")


def process_grid_sheet(filename, start_id):
    src = SOURCES_DIR / filename
    im = Image.open(src).convert("RGB")
    arr = np.array(im)
    row_bounds, col_bounds = find_grid_bounds(arr, count=3)

    idx = start_id
    for r_idx, (y0, y1) in enumerate(row_bounds):
        for c_idx, (x0, x1) in enumerate(col_bounds):
            cell = im.crop((x0, y0, x1, y1))
            cw, ch = cell.size
            # Giữ đúng tỷ lệ gốc của từng ô, scale về chiều ngang TARGET_WIDTH (480px)
            new_h = int(round(ch * TARGET_WIDTH / cw))
            cell = cell.resize((TARGET_WIDTH, new_h), Image.Resampling.LANCZOS)
            out = ASSETS_DIR / f"{idx}.png"
            cell.save(out, "PNG", optimize=True)
            print(f"Saved {out.name} ({cell.size[0]}x{cell.size[1]}) from {filename} [r{r_idx},c{c_idx} crop=({x0},{y0})-({x1},{y1})]")
            idx += 1


def main():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    process_single_001()
    process_grid_sheet("002-010.png", 2)
    process_grid_sheet("011-019.png", 11)
    print("Hoàn tất tách và thay thế ảnh lá bài từ 001 tới 019!")


if __name__ == "__main__":
    main()


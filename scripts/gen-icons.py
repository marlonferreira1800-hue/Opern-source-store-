#!/usr/bin/env python3
"""Gera icon.png (256), icon.ico (multi-tamanho: 16/32/48/64/128/256) e
app_default.png (128) da logo OpenStore (prateleira de apps + seta de download).
Sem dependências externas: monta PNG/BMP/ICO manualmente com zlib/struct.

Uso:
    python scripts/gen-icons.py
"""
import os
import struct
import zlib

LIME = (163, 230, 53)       # #a3e635 — destaque do tema
LIME_DARK = (63, 98, 18)    # #3f6212
DARK = (10, 13, 11)         # #0a0d0b
BORDER = (28, 34, 27)       # #1c221b
BG_IN = (18, 22, 18)        # #121612
BG_OUT = (10, 13, 11)       # #0a0d0b


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def chunk(tipo, data):
    c = struct.pack(">I", len(data)) + tipo + data
    c += struct.pack(">I", zlib.crc32(tipo + data) & 0xFFFFFFFF)
    return c


def encode_png(buf, size):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        raw += buf[y * size * 4:(y + 1) * size * 4]
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def make_png(size, paint_fn):
    buf = bytearray(size * size * 4)
    paint_fn(buf, size)
    return encode_png(buf, size)


def make_bmp_icon(buf, size):
    # Entrada RT_ICON em BMP 32bpp: BITMAPINFOHEADER com altura dupla,
    # máscara XOR (BGRA, bottom-up) seguida da máscara AND (1bpp).
    header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    xor = bytearray()
    for y in range(size - 1, -1, -1):
        for x in range(size):
            i = (y * size + x) * 4
            xor += bytes((buf[i + 2], buf[i + 1], buf[i], buf[i + 3]))
    mask_row = (size + 31) // 32 * 4
    and_mask = bytearray()
    for y in range(size - 1, -1, -1):
        row = bytearray(mask_row)
        for x in range(size):
            if buf[(y * size + x) * 4 + 3] < 128:
                row[x // 8] |= 0x80 >> (x % 8)
        and_mask += row
    return header + bytes(xor) + bytes(and_mask)


def make_ico(entries):
    # entries: lista de (size, data) — BMP para tamanhos <= 128, PNG para 256
    # (formato clássico suportado por Windows e pela crate ico do Rust)
    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    directory = b""
    data = b""
    for size, blob in entries:
        w = 0 if size >= 256 else size
        directory += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(blob), offset)
        data += blob
        offset += len(blob)
    return header + directory + data


def inside_rr(x, y, x0, y0, x1, y1, r):
    if x < x0 or x >= x1 or y < y0 or y >= y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 < r * r


def set_px(buf, s, x, y, color, alpha=255):
    if 0 <= x < s and 0 <= y < s:
        i = (y * s + x) * 4
        if alpha >= 255:
            buf[i:i + 4] = bytes((color[0], color[1], color[2], 255))
        else:
            a = alpha / 255.0
            buf[i] = int(color[0] * a + buf[i] * (1 - a))
            buf[i + 1] = int(color[1] * a + buf[i + 1] * (1 - a))
            buf[i + 2] = int(color[2] * a + buf[i + 2] * (1 - a))
            buf[i + 3] = max(buf[i + 3], alpha)


def disc(buf, s, cx, cy, r, color, alpha=255):
    r2 = r * r
    for yy in range(int(cy - r) - 1, int(cy + r) + 2):
        for xx in range(int(cx - r) - 1, int(cx + r) + 2):
            if (xx - cx) ** 2 + (yy - cy) ** 2 <= r2:
                set_px(buf, s, xx, yy, color, alpha)


def thick_line(buf, s, x0, y0, x1, y1, w, color, alpha=255):
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) * 2 + 1
    r = w / 2.0
    for i in range(steps + 1):
        t = i / steps
        disc(buf, s, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, color, alpha)


def rr_fill(buf, s, x0, y0, x1, y1, r, color_fn):
    for yy in range(int(y0), int(y1)):
        for xx in range(int(x0), int(x1)):
            if inside_rr(xx + 0.5, yy + 0.5, x0, y0, x1, y1, r):
                set_px(buf, s, xx, yy, color_fn(xx + 0.5, yy + 0.5))


def tri_fill(buf, s, ax, ay, bx, by, cx, cy, color):
    minx = int(min(ax, bx, cx))
    maxx = int(max(ax, bx, cx)) + 1
    miny = int(min(ay, by, cy))
    maxy = int(max(ay, by, cy)) + 1
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-9:
        return
    for y in range(miny, maxy):
        for x in range(minx, maxx):
            w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d
            w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d
            w2 = 1.0 - w0 - w1
            if w0 >= 0 and w1 >= 0 and w2 >= 0:
                set_px(buf, s, x, y, color)


def paint_logo(buf, s):
    k = s / 512.0

    # Background: radial gradient inside rounded rect, transparent outside
    r_corner = 116 * k
    m = 12 * k
    cx_bg, cy_bg = 256 * k, 0.36 * s
    for y in range(s):
        for x in range(s):
            if inside_rr(x + 0.5, y + 0.5, 0, 0, s, s, r_corner):
                d = ((x + 0.5 - cx_bg) ** 2 + (y + 0.5 - cy_bg) ** 2) ** 0.5 / (0.8 * s)
                c = lerp(BG_IN, BG_OUT, min(1.0, d))
                set_px(buf, s, x, y, c)
            # Border ring
            if inside_rr(x + 0.5, y + 0.5, 0, 0, s, s, r_corner) and not inside_rr(
                x + 0.5, y + 0.5, m, m, s - m, s - m, max(1.0, r_corner - m)
            ):
                set_px(buf, s, x, y, BORDER)

    # Ground shadow
    sh_cx, sh_cy = 256 * k, 400 * k
    sh_rx, sh_ry = 150 * k, 13 * k
    for y in range(s):
        for x in range(s):
            e = ((x + 0.5 - sh_cx) / sh_rx) ** 2 + ((y + 0.5 - sh_cy) / sh_ry) ** 2
            if e <= 1.0:
                set_px(buf, s, x, y, (0, 0, 0), int(115 * (1 - e * 0.5)))

    # Shelf (prateleira)
    rr_fill(buf, s, 64 * k, 352 * k, 448 * k, 370 * k, 9 * k, lambda px, py: LIME_DARK)

    # Side apps
    rr_fill(buf, s, 86 * k, 246 * k, 186 * k, 346 * k, 22 * k, lambda px, py: LIME_DARK)
    rr_fill(buf, s, 326 * k, 246 * k, 426 * k, 346 * k, 22 * k, lambda px, py: LIME_DARK)

    # Center app (destaque)
    rr_fill(buf, s, 206 * k, 246 * k, 306 * k, 346 * k, 22 * k, lambda px, py: LIME)

    # Download arrow inside the center app (dark)
    thick_line(buf, s, 256 * k, 266 * k, 256 * k, 300 * k, 12 * k, DARK)
    tri_fill(buf, s, 234 * k, 296 * k, 278 * k, 296 * k, 256 * k, 324 * k, DARK)
    rr_fill(buf, s, 232 * k, 330 * k, 280 * k, 338 * k, 4 * k, lambda px, py: DARK)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ico_sizes = [16, 32, 48, 64, 128, 256]
    ico_entries = []
    for size in ico_sizes:
        buf = bytearray(size * size * 4)
        paint_logo(buf, size)
        blob = encode_png(buf, size) if size >= 256 else make_bmp_icon(buf, size)
        ico_entries.append((size, blob))
    png256 = make_png(256, paint_logo)
    png128 = make_png(128, paint_logo)

    paths = {
        os.path.join(root, "src-tauri", "icons", "icon.png"): png256,
        os.path.join(root, "src-tauri", "icons", "icon.ico"): make_ico(ico_entries),
        os.path.join(root, "src-tauri", "icons", "app_default.png"): png128,
        os.path.join(root, "web", "assets", "icons", "app_default.png"): png128,
    }
    for path, data in paths.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        print(f"gerado: {path} ({len(data)} bytes)")


if __name__ == "__main__":
    main()

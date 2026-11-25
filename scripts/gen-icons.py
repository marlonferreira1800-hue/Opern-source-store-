#!/usr/bin/env python3
"""Gera icon.png (256), icon.ico (multi-tamanho: 16/32/48/64/128/256) e
app_default.png (128) da logo Asclepio.
Sem dependências externas: monta PNG/BMP/ICO manualmente com zlib/struct.

Uso:
    python scripts/gen-icons.py
"""
import os
import struct
import zlib

CYAN = (34, 211, 238)
BLUE = (56, 189, 248)
PURPLE = (139, 92, 246)
DARK = (9, 9, 11)
BORDER = (38, 38, 46)
BG_IN = (23, 23, 30)
BG_OUT = (9, 9, 11)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def lerp_stops(stops, t):
    t = max(0.0, min(1.0, t))
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        if p0 <= t <= p1:
            f = 0 if p1 == p0 else (t - p0) / (p1 - p0)
            return lerp(c0, c1, f)
    return stops[-1][1]


SNAKE_STOPS = [(0.0, CYAN), (0.45, BLUE), (1.0, PURPLE)]


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


def inside_circle(x, y, cx, cy, r):
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


def bezier(p0, c0, c1, p1, t):
    u = 1 - t
    x = u**3 * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t**3 * p1[0]
    y = u**3 * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t**3 * p1[1]
    return x, y


SNAKE_SEGS = [
    ((318, 118), (226, 128), (196, 168), (250, 196)),
    ((250, 196), (322, 232), (336, 262), (258, 288)),
    ((258, 288), (186, 312), (190, 356), (254, 376)),
    ((254, 376), (300, 390), (336, 398), (352, 412)),
]


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
    sh_cx, sh_cy = 256 * k, 440 * k
    sh_rx, sh_ry = 88 * k, 12 * k
    for y in range(s):
        for x in range(s):
            e = ((x + 0.5 - sh_cx) / sh_rx) ** 2 + ((y + 0.5 - sh_cy) / sh_ry) ** 2
            if e <= 1.0:
                set_px(buf, s, x, y, (0, 0, 0), int(115 * (1 - e * 0.5)))

    # Snake body (behind staff): sampled beziers painted as discs with gradient by t
    total = 0
    seg_pts = []
    for seg in SNAKE_SEGS:
        n = 160
        pts = [bezier(*seg, i / n) for i in range(n + 1)]
        seg_pts.append(pts)
        total += n
    idx = 0
    for pts in seg_pts:
        for (px, py) in pts:
            t = idx / total
            idx += 1
            disc(buf, s, px * k, py * k, 13 * k, lerp_stops(SNAKE_STOPS, t))

    # Staff with diagonal gradient
    def staff_color(px, py):
        return lerp(CYAN, PURPLE, (px + py) / (2.0 * s))

    rr_fill(buf, s, 247 * k, 96 * k, 265 * k, 426 * k, 9 * k, staff_color)
    disc(buf, s, 256 * k, 82 * k, 24 * k, staff_color(256 * k, 82 * k))
    rr_fill(buf, s, 234 * k, 416 * k, 278 * k, 430 * k, 7 * k, staff_color)

    # Head
    disc(buf, s, 320 * k, 110 * k, 21 * k, PURPLE)
    disc(buf, s, 312 * k, 103 * k, 4.5 * k, DARK)
    disc(buf, s, 328 * k, 103 * k, 4.5 * k, DARK)
    # Forked tongue
    thick_line(buf, s, 338 * k, 118 * k, 362 * k, 108 * k, 5 * k, CYAN)
    thick_line(buf, s, 338 * k, 118 * k, 364 * k, 122 * k, 5 * k, CYAN)

    # Terminal cursor tail
    rr_fill(buf, s, 346 * k, 402 * k, 359 * k, 426 * k, 3 * k, lambda px, py: CYAN)


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

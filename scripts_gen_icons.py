#!/usr/bin/env python3
"""Gera icon.png (256), icon.ico e app_default.png (128) para o Open Source Store.
Sem dependencias externas: monta o PNG manualmente com zlib."""
import zlib, struct, os

def chunk(tipo, data):
    c = struct.pack(">I", len(data)) + tipo + data
    c += struct.pack(">I", zlib.crc32(tipo + data) & 0xFFFFFFFF)
    return c

def make_png(size, draw_fn):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        for x in range(size):
            r, g, b, a = draw_fn(x, y, size)
            raw += bytes((r, g, b, a))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))

def make_ico(png_bytes, size):
    # ICONDIR + 1 ICONDIRENTRY + PNG embutido (Windows Vista+ / crate ico do Rust)
    header = struct.pack("<HHH", 0, 1, 1)
    w = 0 if size >= 256 else size
    entry = struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(png_bytes), 6 + 16)
    return header + entry + png_bytes

def store_icon(x, y, s):
    # fundo escuro, quadrado azul central (logo simples da loja)
    bg = (13, 13, 13, 255)
    blue = (77, 171, 255, 255)
    dark_blue = (51, 154, 240, 255)
    m = s * 0.22  # margem
    cx0, cx1 = m, s - m
    cy0, cy1 = m, s - m
    if cx0 <= x < cx1 and cy0 <= y < cy1:
        # gradiente leve + "prateleira" (barra inferior)
        if y > s - m - (s * 0.08):
            return dark_blue
        return blue
    return bg

def default_icon(x, y, s):
    bg = (45, 45, 45, 255)
    fg = (179, 179, 179, 255)
    m = s * 0.25
    if m <= x < s - m and m <= y < s - m:
        # quadradinho com "A" estilizado: simplesmente um anel
        d = min(x - m, s - m - x, y - m, s - m - y)
        if d < s * 0.07:
            return fg
        if s * 0.14 < d < s * 0.21:
            return fg
    return bg

base = os.path.dirname(os.path.abspath(__file__))

png256 = make_png(256, store_icon)
png128 = make_png(128, default_icon)

paths = {
    os.path.join(base, "src-tauri/icons/icon.png"): png256,
    os.path.join(base, "src-tauri/icons/icon.ico"): make_ico(png256, 256),
    os.path.join(base, "src-tauri/icons/app_default.png"): png128,
    os.path.join(base, "web/assets/icons/app_default.png"): png128,
    os.path.join(base, "assets/icons/app_default.png"): png128,
}
for p, data in paths.items():
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data)
    print(f"gerado: {p} ({len(data)} bytes)")

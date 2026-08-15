#!/usr/bin/env python3
"""Resize and re-encode the site photography.

Downscales anything wider than MAX_W, rewrites the JPEG/PNG at a sane quality,
and writes a .webp alongside each one so the markup's <picture> can prefer it.

    pip install Pillow
    python3 tools/optimise-images.py
"""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
IMG_DIRS = [ROOT / "assets" / "img" / "work"]
LOGO_DIR = ROOT / "assets" / "img" / "brand"

MAX_W = 1600
JPEG_Q = 72
WEBP_Q = 68


def process(path: Path, max_w: int = MAX_W) -> None:
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        before = path.stat().st_size

        # Scale on the long edge so tall portrait shots get bounded too.
        long_edge = max(im.width, im.height)
        resized = long_edge > max_w
        if resized:
            scale = max_w / long_edge
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)

        webp_path = path.with_suffix(".webp")
        tmp = path.with_suffix(path.suffix + ".tmp")

        if path.suffix.lower() in {".jpg", ".jpeg"}:
            rgb = im.convert("RGB")
            rgb.save(tmp, "JPEG", quality=JPEG_Q, optimize=True, progressive=True)
            rgb.save(webp_path, "WEBP", quality=WEBP_Q, method=6)
        else:
            im.save(tmp, format=im.format or "PNG", optimize=True)
            im.save(webp_path, "WEBP", quality=WEBP_Q, method=6)

        # Re-encoding an already-compressed file can grow it. Only keep the new
        # one if it actually saves bytes (or if we needed to downscale anyway).
        if resized or tmp.stat().st_size < before:
            tmp.replace(path)
        else:
            tmp.unlink()

        print(
            f"  {path.relative_to(ROOT)}  {before // 1024}KB -> "
            f"{path.stat().st_size // 1024}KB (+{webp_path.stat().st_size // 1024}KB webp)"
        )


def main() -> None:
    print("Optimising photography…")
    for d in IMG_DIRS:
        for p in sorted(d.iterdir()):
            if p.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                process(p)

    print("Optimising logos…")
    for p in sorted(LOGO_DIR.iterdir()):
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and p.name != "apple-touch-icon.png":
            process(p, max_w=900)

    print("Done.")


if __name__ == "__main__":
    main()

"""Set the icon of an extension from an image.

    python tools/dev/set-icon.py SOURCE EXTENSION [--force] [--background HEX] [--padding PERCENT]

EXTENSION is an extension id or the path of its directory
The icon is written to <extension dir>/icon.ico

The icon is always opaque: transparent pixels are flattened on --background
(hex, white by default)

Requires Pillow: pip install pillow (and cairosvg for SVG sources)
"""

import argparse
import io
import re
import struct
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("error: Pillow is required, install it with: pip install pillow")

ROOT = Path(__file__).resolve().parents[2]
ICON_NAME = "icon.ico"
SIZES = (128, 64, 32, 16)
SVG_SIZE = 512

def display(path):
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def resolve_extension(target):
    for path in (Path(target), ROOT / target):
        if path.is_dir() and (path / "payload.ts").is_file():
            return path.resolve()

    dirs = sorted(p.parent for p in (ROOT / "src").rglob("payload.ts") if "_shared" not in p.parts)
    matches = [d for d in dirs if d.name == target]
    if len(matches) == 1:
        return matches[0]
    if matches:
        raise ValueError(f'"{target}" is ambiguous: ' + ", ".join(display(d) for d in matches))
    raise ValueError(f'unknown extension "{target}", available: ' + ", ".join(d.name for d in dirs))


def parse_color(value):
    if not re.fullmatch(r"#?[0-9a-fA-F]{6}", value):
        raise argparse.ArgumentTypeError(f"invalid color {value!r}, expected 6 hex digits like ffffff")
    return "#" + value.removeprefix("#")


def parse_padding(value):
    try:
        percent = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"invalid padding {value!r}")
    if not 0 <= percent < 50:
        raise argparse.ArgumentTypeError(f"padding must be at least 0 and below 50, got {value}")
    return percent


def open_image(path):
    if path.suffix.lower() != ".svg":
        return Image.open(path)
    try:
        import cairosvg
    except ImportError:
        raise ValueError("cairosvg is required for SVG sources, install it with: pip install cairosvg")
    return Image.open(io.BytesIO(cairosvg.svg2png(url=str(path), output_width=SVG_SIZE)))


def load_source(path, background):
    with open_image(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGBA")
        transparent = image.getchannel("A").getextrema()[0] < 255
        canvas = Image.new("RGBA", image.size, background)
        return Image.alpha_composite(canvas, image).convert("RGB"), transparent


def make_square(image, percent, background):
    side = max(image.size)
    inner = side - 2 * round(side * percent / 100)
    size = tuple(max(round(d * inner / side), 1) for d in image.size)
    if size != image.size:
        image = image.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (side, side), background)
    canvas.paste(image, ((side - size[0]) // 2, (side - size[1]) // 2))
    return canvas


def encode_png(image):
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def build_ico(source):
    images = [encode_png(source.resize((size, size), Image.Resampling.LANCZOS)) for size in SIZES]

    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    directory = b""
    body = b""

    for size, png in zip(SIZES, images):
        directory += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 24, len(png), offset + len(body))
        body += png

    return header + directory + body


def main():
    parser = argparse.ArgumentParser(description=f"Set the {ICON_NAME} of an extension from a PNG, JPEG, ICO or SVG image")
    parser.add_argument("source", type=Path, help="source image path")
    parser.add_argument("extension", help="extension id or directory path")
    parser.add_argument("--force", action="store_true", help=f"overwrite an existing {ICON_NAME}")
    parser.add_argument("--background", type=parse_color, default="#ffffff", metavar="HEX", help="color to replace transparency (6 hex digits, default: ffffff)")
    parser.add_argument("--padding", type=parse_padding, default=0, metavar="PERCENT", help="margin percentage per side (0 to <50, default: 0)")
    args = parser.parse_args()

    try:
        output = resolve_extension(args.extension) / ICON_NAME

        if args.source.resolve() == output.resolve():
            raise ValueError("source is the icon to replace, copy it elsewhere first")
        if output.exists() and not args.force:
            raise ValueError(f"{display(output)} already exists, use --force to replace it")

        source, transparent = load_source(args.source, args.background)
        if max(source.size) < max(SIZES):
            print(f"warning: source is {max(source.size)}px, below {max(SIZES)}px: the icon will be upscaled", file=sys.stderr)
        if transparent:
            print(f"warning: source has transparency, flattened on {args.background}", file=sys.stderr)

        data = build_ico(make_square(source, args.padding, args.background))
        output.write_bytes(data)
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print(f"{display(output)} ({len(data)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

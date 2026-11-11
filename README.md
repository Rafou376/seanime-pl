# seanime-pl

[![License: MIT](https://img.shields.io/github/license/Rafou376/seanime-pl?labelColor=182a44&color=DEDEDE)](/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Rafou376/seanime-pl/build.yml?labelColor=182a44)](https://github.com/Rafou376/seanime-pl/actions/workflows/build.yml)

A collection of extensions for [Seanime](https://seanime.app).  
To request a new extension or report a bug, please [open an issue](https://github.com/Rafou376/seanime-pl/issues/new).

## Setup

```bash
git clone https://github.com/Rafou376/seanime-pl.git
cd seanime-pl
npm ci
```

## Building

```bash
# Build all extensions
npm run build

# Build specific extensions
npm run build src/manga/mangalib src/onlinestream/french-stream
```

## Icons

Requires [Pillow](https://pypi.org/project/pillow) (and [CairoSVG](https://pypi.org/project/CairoSVG) for SVG sources).

```bash
python tools/dev/set-icon.py SOURCE EXTENSION [--force] [--background HEX] [--padding PERCENT]
```

| Argument | Description |
| --- | --- |
| `SOURCE` | Source image path (PNG, JPEG, ICO or SVG) |
| `EXTENSION` | Extension ID or directory path |
| `--force` | Overwrite an existing `icon.ico` |
| `--background HEX` | Color to replace transparency (6 hex digits, default `ffffff`) |
| `--padding PERCENT` | Margin percentage per side (0 to <50, default `0`) |

## Contributing

Contributions are welcome! See the [documentation](https://seanime.gitbook.io/seanime-extensions) to get started.

[![Contributors](https://contrib.rocks/image?repo=Rafou376/seanime-pl)](https://github.com/Rafou376/seanime-pl/graphs/contributors)

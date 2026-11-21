"""Create a portable browser build and source archive."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


FILES = (
    "LICENSE",
    "README.md",
    "build_release.py",
    "engine.mjs",
    "engine.test.mjs",
    "game.mjs",
    "index.html",
    "style.css",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    files = [(name, (source / name).read_bytes()) for name in FILES]
    with ZipFile(args.output, mode="x") as archive:
        for name, data in files:
            info = ZipInfo(name, date_time=(2026, 11, 21, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=ZIP_DEFLATED, compresslevel=9)


if __name__ == "__main__":
    main()

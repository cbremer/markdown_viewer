#!/usr/bin/env python3
"""Generate or verify macOS icons using Apple's sips and iconutil (macOS only)."""
import argparse
import plistlib
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIZES = {"ic04": (16, "icon_16x16.png"), "ic05": (32, "icon_32x32.png"),
         "ic11": (32, "icon_16x16@2x.png"), "ic12": (64, "icon_32x32@2x.png"),
         "ic07": (128, "icon_128x128.png"), "ic13": (256, "icon_128x128@2x.png"),
         "ic08": (256, "icon_256x256.png"), "ic14": (512, "icon_256x256@2x.png"),
         "ic09": (512, "icon_512x512.png"), "ic10": (1024, "icon_512x512@2x.png")}


def run(*args):
    subprocess.run([str(a) for a in args], check=True, stdout=subprocess.DEVNULL)


def source_iconset(directory):
    directory.mkdir()
    for size, name in SIZES.values():
        run("sips", "-z", size, size, ROOT / "build/icon.png", "--out", directory / name)


def entries(data):
    if data[:4] != b"icns" or len(data) < 8 or struct.unpack_from(">I", data, 4)[0] != len(data):
        raise ValueError("Invalid ICNS header/length")
    result = {}
    offset = 8
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("Truncated ICNS entry")
        kind, length = struct.unpack_from(">4sI", data, offset)
        if length < 8 or offset + length > len(data) or kind in result:
            raise ValueError("Invalid ICNS entry length or duplicate")
        result[kind] = data[offset + 8:offset + length]
        offset += length
    for kind in (b"icp4", b"icp5", b"icp6"):
        if kind in result:
            raise ValueError(f"Incompatible small entry: {kind.decode()}")
    for kind in SIZES:
        payload = result.get(kind.encode(), b"")
        signature = b"ARGB" if kind in ("ic04", "ic05") else b"\x89PNG\r\n\x1a\n"
        if not payload.startswith(signature):
            raise ValueError(f"Missing or incompatible {kind} payload")
    return result


def pixels(png, output, size):
    # Let Apple's decoder render to a simple bitmap; compare visible premultiplied
    # channels rather than PNG bytes/metadata or undefined RGB under transparency.
    run("sips", "-s", "format", "bmp", png, "--out", output)
    data = output.read_bytes()
    offset = struct.unpack_from("<I", data, 10)[0]
    width, height, planes, depth, compression = struct.unpack_from("<iiHHI", data, 18)
    if (width, abs(height), planes, depth, compression) != (size, size, 1, 32, 3):
        raise ValueError("Unexpected sips BMP format")
    if struct.unpack_from("<IIII", data, 54) != (0xff0000, 0xff00, 0xff, 0xff000000):
        raise ValueError("Unexpected BMP channel masks")
    rows = range(size - 1, -1, -1) if height > 0 else range(size)
    for y in rows:
        row = memoryview(data)[offset + y * size * 4:offset + (y + 1) * size * 4]
        if len(row) != size * 4:
            raise ValueError("Truncated bitmap")
        for i in range(0, len(row), 4):
            b, g, r, a = row[i:i + 4]
            yield from (b * a / 255, g * a / 255, r * a / 255, a)


def verify(icon, app=None):
    data = icon.read_bytes()
    entries(data)
    if app:
        if data != (ROOT / "build/icon.icns").read_bytes():
            raise ValueError("Packaged icon differs from committed icon")
        with (app / "Contents/Info.plist").open("rb") as stream:
            info = plistlib.load(stream)
        if info.get("CFBundleIconFile") != "icon.icns":
            raise ValueError("Unexpected application icon registration")
        documents = info.get("CFBundleDocumentTypes", [])
        for extension in ("md", "markdown"):
            if not any(extension in d.get("CFBundleTypeExtensions", []) and
                       d.get("CFBundleTypeIconFile") == "icon.icns" for d in documents):
                raise ValueError(f"Missing {extension} document/icon registration")
    with tempfile.TemporaryDirectory(prefix="specdown-icon-") as temp:
        temp = Path(temp)
        expected = temp / "expected.iconset"
        extracted = temp / "extracted.iconset"
        source_iconset(expected)
        run("iconutil", "-c", "iconset", icon, "-o", extracted)
        for size, name in SIZES.values():
            actual = pixels(extracted / name, temp / "actual.bmp", size)
            reference = pixels(expected / name, temp / "expected.bmp", size)
            total, peak, count = 0.0, 0.0, 0
            for a, b in zip(actual, reference, strict=True):
                error = abs(a - b)
                total += error
                peak = max(peak, error)
                count += 1
            mean = total / count
            # Apple's small ARGB conversion is lossy at antialiased edges.
            # Limits are in 8-bit channel units, measured after premultiplication.
            mean_limit, peak_limit = (4, 40) if size <= 32 else (1, 8)
            if mean > mean_limit or peak > peak_limit:
                raise ValueError(f"{name}: rendered pixels differ (mean={mean:.3f}, max={peak:.3f})")
            print(f"PASS {name}: mean error={mean:.3f}, max={peak:.3f}")
    print(f"PASS {icon}: compatible entries, fresh Apple decode, source artwork" +
          (", byte-identical packaging, md/markdown registrations" if app else ""))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("generate", "verify"))
    parser.add_argument("path", nargs="?", type=Path, help="ICNS or packaged .app to verify")
    args = parser.parse_args()
    if args.command == "generate":
        if args.path:
            parser.error("generate always writes build/icon.icns")
        with tempfile.TemporaryDirectory(prefix="specdown-icon-") as temp:
            iconset = Path(temp) / "source.iconset"
            source_iconset(iconset)
            run("iconutil", "-c", "icns", iconset, "-o", ROOT / "build/icon.icns")
    path = (args.path or ROOT / "build/icon.icns").resolve()
    app = path if path.suffix == ".app" else None
    verify(app / "Contents/Resources/icon.icns" if app else path, app)


if __name__ == "__main__":
    main()

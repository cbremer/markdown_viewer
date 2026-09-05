"""Container regression tests; runs on any platform with Python 3."""
import importlib.util
import struct
import sys
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("macos_icon", Path(__file__).with_name("macos-icon.py"))
icon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icon)


class IconTests(unittest.TestCase):
    def setUp(self):
        self.data = (icon.ROOT / "build/icon.icns").read_bytes()

    def test_committed_icon(self):
        icon.entries(self.data)

    def test_incompatible_small_tags(self):
        for good, bad in ((b"ic04", b"icp4"), (b"ic05", b"icp5")):
            with self.subTest(tag=bad), self.assertRaisesRegex(ValueError, "Incompatible small"):
                icon.entries(self.data.replace(good, bad, 1))

    def test_png_disguised_as_argb(self):
        with self.assertRaisesRegex(ValueError, "incompatible ic04"):
            icon.entries(self.data.replace(b"ARGB", b"\x89PNG", 1))

    @unittest.skipUnless(sys.platform == "darwin", "Requires Apple icon tools")
    def test_valid_argb_with_wrong_artwork(self):
        with tempfile.TemporaryDirectory(prefix="specdown-icon-test-") as temp:
            temp = Path(temp)
            iconset = temp / "wrong.iconset"
            icon.source_iconset(iconset)
            small = iconset / "icon_16x16.png"
            icon.run("sips", "--flip", "vertical", small, "--out", small)
            wrong = temp / "wrong.icns"
            icon.run("iconutil", "-c", "icns", iconset, "-o", wrong)
            icon.entries(wrong.read_bytes())  # Valid ARGB tags alone must not pass.
            with self.assertRaisesRegex(ValueError, "rendered pixels differ"):
                icon.verify(wrong)

    def test_truncated_container(self):
        with self.assertRaises(ValueError):
            icon.entries(self.data[:-1])

    def test_invalid_entry_length(self):
        data = bytearray(self.data)
        struct.pack_into(">I", data, 12, 0)
        with self.assertRaises(ValueError):
            icon.entries(data)


if __name__ == "__main__":
    unittest.main()

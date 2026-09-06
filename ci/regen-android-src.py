"""Regenerates ci/android-src.partNN from the current android/ tree.

Mirrors the upstream layout: zip the android/ directory, base64-encode it,
then split into fixed-size text parts (6000 bytes each) without line breaks.
"""
from pathlib import Path
import base64
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ANDROID_DIR = ROOT / "android"
ZIP_PATH = ROOT / "android-build-src.zip"
PART_PREFIX = ROOT / "ci" / "android-src.part"
PART_SIZE = 6000

SKIP_FILES = {
    "gradle-wrapper.jar",
}


def build_zip():
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(ANDROID_DIR.rglob("*")):
            if path.name in SKIP_FILES:
                continue
            if "build" in path.relative_to(ANDROID_DIR).parts:
                continue
            if ".gradle" in path.relative_to(ANDROID_DIR).parts:
                continue
            arcname = "android/" + path.relative_to(ANDROID_DIR).as_posix()
            if path.is_dir():
                zf.writestr(arcname + "/", b"")
            else:
                zf.write(path, arcname)


def split_parts():
    encoded = base64.b64encode(ZIP_PATH.read_bytes()).decode("ascii")
    index = 0
    for start in range(0, len(encoded), PART_SIZE):
        (PART_PREFIX.parent / f"{PART_PREFIX.name}{index:02d}").write_text(
            encoded[start:start + PART_SIZE], encoding="ascii"
        )
        index += 1
    return index


if __name__ == "__main__":
    build_zip()
    count = split_parts()
    print(f"zip: {ZIP_PATH} ({ZIP_PATH.stat().st_size} bytes)")
    print(f"parts written: {count}")

"""Restore pinned packages from an existing npm cache without modifying that cache."""
from pathlib import Path
import base64, hashlib, io, json, tarfile, zipfile, os

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path.home() / ".npm/_cacache"
PACKAGES = {
    "react": "19.2.0", "react-dom": "19.2.0", "scheduler": "0.27.0",
    "fflate": "0.8.2", "esbuild": "0.25.10",
    "@esbuild/darwin-arm64": "0.25.10", "typescript": "5.9.3",
    "@types/node": "22.13.9", "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3", "csstype": "3.1.3",
    "undici-types": "6.20.0", "electron": "44.3.0",
    "playwright": "1.63.0", "playwright-core": "1.63.0",
}
entries = {}
for index in (CACHE / "index-v5").glob("*/*/*"):
    for line in index.read_text(errors="ignore").splitlines():
        try:
            item = json.loads(line.split("\t", 1)[1])
            entries[item["key"]] = item
        except (ValueError, KeyError, IndexError):
            pass
for name, version in PACKAGES.items():
    basename = name.split("/")[-1]
    url = f"https://registry.npmjs.org/{name}/-/{basename}-{version}.tgz"
    entry = next((v for k, v in entries.items() if k.endswith(url)), None)
    if not entry:
        raise SystemExit(f"Missing cache entry: {name}@{version}")
    algorithm, digest = entry["integrity"].split("-", 1)
    hexadecimal = base64.b64decode(digest).hex()
    content = CACHE / "content-v2" / algorithm / hexadecimal[:2] / hexadecimal[2:4] / hexadecimal[4:]
    raw = content.read_bytes()
    assert hashlib.new(algorithm, raw).hexdigest() == hexadecimal
    dest = ROOT / "node_modules" / name
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
        for member in tar.getmembers():
            parts = Path(member.name).parts[1:]
            if not parts:
                continue
            target = dest.joinpath(*parts)
            if not target.resolve().is_relative_to(dest.resolve()):
                raise ValueError("Unsafe archive")
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())
                target.chmod(member.mode)
    print(f"Restored {name}@{version}")

archives = list((Path.home() / "Library/Caches/electron").glob("*/electron-v44.3.0-darwin-arm64.zip"))
if not archives:
    raise SystemExit("Electron archive missing")
dest = ROOT / "node_modules/electron/dist"
dest.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archives[0]) as archive:
    for member in archive.infolist():
        target = dest / member.filename
        if not target.resolve().is_relative_to(dest.resolve()):
            raise ValueError("Unsafe zip")
        mode = member.external_attr >> 16
        if member.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif (mode & 0o170000) == 0o120000:
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() and not target.is_symlink():
                target.symlink_to(archive.read(member).decode())
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(member))
            target.chmod(mode & 0o777 or 0o644)
(ROOT / "node_modules/electron/path.txt").write_text("Electron.app/Contents/MacOS/Electron")
print("Restored Electron runtime. All writes stayed inside the workspace.")

#!/usr/bin/env python3
"""Construye el paquete universitario de eyetracking desde commits fijados de Git."""
import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "19c96bd762cd7a1dfce55fdb8239c33e80870ef7"
SOURCE = "f476cd795e0b033a81ef82301fa9c6136383eb3e"
EDITION = "2026-10-30.1"
CHANGE_ID = "COG-20261028-eyetracking-movil"
PREFIXES = ("src/lab/eyetracking/", "public/web/tfjs-wasm/")
E2E = "e2e/eyetracking-lab.spec.ts"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def ls(ref, *paths):
    return git("ls-tree", "-r", "--name-only", ref, "--", *paths).decode().splitlines()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    source = git("rev-parse", SOURCE).decode().strip()
    paths = git("diff", "--name-only", BASE, source, "--", *PREFIXES, E2E).decode().splitlines()
    if not paths or any(not (p.startswith(PREFIXES) or p == E2E) for p in paths):
        raise ValueError("Alcance de parche inválido")
    base_files = set(ls(BASE, *PREFIXES, E2E))
    final_files = set(ls(source, "src/lab/eyetracking", "public/web", E2E))
    if not set(paths).issubset(final_files):
        raise ValueError("Este paquete no admite eliminaciones: revisar el manifiesto")
    files = {}
    changes = []
    for path in sorted(final_files):
        files[f"actual/{path}"] = git("show", f"{source}:{path}")
    for path in paths:
        previous = git("show", f"{BASE}:{path}") if path in base_files else None
        if previous is not None:
            files[f"base/{path}"] = previous
        changes.append({"path": path, "base_sha256": sha(previous) if previous is not None else None,
                        "target_sha256": sha(files[f"actual/{path}"])})
    files["cambios.patch"] = git("diff", "--binary", "--full-index", BASE, source, "--", *paths)
    for path in ("src/tools/visual/eye/schema.ts", "src/tools/visual/eye/samples.ts"):
        files[f"referencia/{path}"] = git("show", f"{source}:{path}")
    files["GUIA.md"] = (ROOT / "docs/replicas/eyetracking-anahuac/GUIA.md").read_bytes()
    files["COMPATIBILIDAD_UNIVERSITARIA.md"] = (ROOT / "docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md").read_bytes()
    files["FICHA.md"] = git("show", f"{source}:docs/backlog/cambios/{CHANGE_ID}.md")
    files["verificar.py"] = (ROOT / "scripts/verify-eyetracking-package.py").read_bytes()
    files["DEPENDENCIAS.json"] = dump({"dependencies": {"@mediapipe/tasks-vision": "0.10.35",
        "@tensorflow/tfjs-core": "4.22.0", "@tensorflow/tfjs-backend-wasm": "4.22.0", "webeyetrack": "0.0.2"},
        "policy": "Instalar en el manifiesto y lockfile del destino; no sustituirlos por los del origen."})
    manifest = {"change_id": CHANGE_ID, "edition": EDITION, "repository": "yveltal2026/neurofusion",
        "base_commit": BASE, "source_commit": source, "destination": "Anáhuac Mayab: sin verificar",
        "source_confirmation": "Propietario confirma funcionamiento correcto después de PR #22 en Android/Chrome, S25 Ultra.",
        "changes": changes, "files": {p: {"sha256": sha(data), "bytes": len(data)} for p, data in sorted(files.items())}}
    files["MANIFIESTO.json"] = dump(manifest)
    files["SHA256SUMS"] = "".join(f"{sha(data)}  {path}\n" for path, data in sorted(files.items())).encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, data in sorted(files.items()):
            info = zipfile.ZipInfo(f"eyetracking-anahuac-{EDITION}/{path}", date_time=(2026, 10, 30, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    print(f"{args.output}: {len(files)} archivos, {len(changes)} cambios de producto")
    print(f"SHA256 {sha(args.output.read_bytes())}")


if __name__ == "__main__":
    main()

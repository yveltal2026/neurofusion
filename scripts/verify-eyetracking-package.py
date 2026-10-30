#!/usr/bin/env python3
"""Verifica el paquete y compara el destino sin escribir en él. Sólo biblioteca estándar."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_path(root, relative):
    parts = PurePosixPath(relative)
    if parts.is_absolute() or ".." in parts.parts:
        raise ValueError(f"Ruta inválida: {relative}")
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Ruta fuera del paquete/destino: {relative}")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destino", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    try:
        sums = {}
        for line in (root / "SHA256SUMS").read_text().splitlines():
            sha, relative = line.split("  ", 1)
            if relative in sums:
                raise ValueError(f"Ruta duplicada: {relative}")
            sums[relative] = sha
        if "MANIFIESTO.json" not in sums:
            raise ValueError("Falta el manifiesto en SHA256SUMS")
        for relative, sha in sums.items():
            path = safe_path(root, relative)
            if not path.is_file() or digest(path) != sha:
                raise ValueError(f"Integridad incorrecta: {relative}")
        manifest = json.loads((root / "MANIFIESTO.json").read_text())
        for relative, metadata in manifest["files"].items():
            if sums.get(relative) != metadata["sha256"]:
                raise ValueError(f"Manifiesto inconsistente: {relative}")
        print(f"Integridad correcta: {len(sums)} archivos; {manifest['change_id']}")
        if not args.destino:
            return 0
        if not (args.destino / "package.json").is_file():
            raise ValueError("El destino no contiene package.json")
        divergences = 0
        for item in manifest["changes"]:
            path = safe_path(args.destino, item["path"])
            actual = digest(path) if path.is_file() else None
            if actual == item["target_sha256"]:
                state = "ya actualizado"
            elif actual == item["base_sha256"]:
                state = "nuevo" if actual is None else "coincide con base"
            else:
                state = "divergente: adaptar"
                divergences += 1
            print(f"{state}: {item['path']}")
        print(f"Comparación terminada: {divergences} divergencias. No se modificó el destino.")
        return 2 if divergences else 0
    except (OSError, ValueError, KeyError) as error:
        print(f"ERROR: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

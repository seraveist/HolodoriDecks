from pathlib import Path
root = Path(__file__).resolve().parents[1]
for name, old, new in [
    ('VERSION', '1.0.0', '1.1.0'),
    ('pyproject.toml', 'version = "1.0.0"', 'version = "1.1.0"'),
    ('src/holodori_decksim/__init__.py', '__version__ = "1.0.0"', '__version__ = "1.1.0"'),
]:
    path = root / name
    text = path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing marker in {name}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

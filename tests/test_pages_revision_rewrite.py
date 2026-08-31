from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "rewrite-pages-revisions.py"

spec = importlib.util.spec_from_file_location("rewrite_pages_revisions", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_revision_helpers_import_without_music_search_dependencies() -> None:
    probe = f'''
import builtins
import importlib.util
from pathlib import Path

blocked = {{"hunmin", "hanja", "pykakasi", "pypinyin"}}
original_import = builtins.__import__

def guarded_import(name, *args, **kwargs):
    if name.split(".", 1)[0] in blocked:
        raise RuntimeError(f"optional music-search dependency imported during module load: {{name}}")
    return original_import(name, *args, **kwargs)

builtins.__import__ = guarded_import
script = Path({str(SCRIPT)!r})
spec = importlib.util.spec_from_file_location("rewrite_pages_core_probe", script)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert callable(module.rewrite_index)
assert callable(module.rewrite_js_references)
'''
    subprocess.run([sys.executable, "-c", probe], cwd=ROOT, check=True)


def test_js_rewrite_updates_only_complete_js_string_paths() -> None:
    source = '''
import { t } from "./i18n.js?v=old";
const manifest = new URL("../data/generated/manifest.json", import.meta.url);
const cards = new URL("../data/generated/cards.json", import.meta.url);
const worker = new URL("./optimizer-worker.js", import.meta.url);
'''

    rewritten = module.rewrite_js_references(source, "deadbeef")

    assert '"./i18n.js?v=deadbeef"' in rewritten
    assert '"./optimizer-worker.js?v=deadbeef"' in rewritten
    assert '"../data/generated/manifest.json"' in rewritten
    assert '"../data/generated/cards.json"' in rewritten
    assert "manifest.js?v=" not in rewritten
    assert "cards.js?v=" not in rewritten


def test_index_rewrite_injects_revision_and_app_query() -> None:
    source = '''<!doctype html>
<html lang="ko" data-app-version="1.1.2">
<body><script type="module" src="./js/app.js?v=1.1.2"></script></body>
</html>
'''

    rewritten = module.rewrite_index(source, "cafebabe")

    assert 'data-card-asset-revision="cafebabe"' in rewritten
    assert 'src="./js/app.js?v=cafebabe"' in rewritten


def test_index_rewrite_replaces_existing_revision_without_duplication() -> None:
    source = '''<!doctype html>
<html lang="ko" data-app-version="1.1.2" data-card-asset-revision="old">
<body><script type="module" src="./js/app.js?v=old"></script></body>
</html>
'''

    rewritten = module.rewrite_index(source, "new")

    assert rewritten.count("data-card-asset-revision=") == 1
    assert 'data-card-asset-revision="new"' in rewritten
    assert 'src="./js/app.js?v=new"' in rewritten

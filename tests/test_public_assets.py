from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import tinycss2

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('public_css', ROOT / 'scripts/build-public-css.py')
css = importlib.util.module_from_spec(spec)
spec.loader.exec_module(css)


def test_css_token_compaction_preserves_values_and_combinators(tmp_path):
    path = tmp_path / 'test.css'
    text = '/* top */ .parent  .child { content: "A  B;/*string*/"; width: calc(100% - 2px); --space: 1px  2px; }'
    path.write_text(text)
    result = tinycss2.serialize(css.collect_rules(path, tmp_path))
    assert '.parent .child' in result
    assert '"A  B;/*string*/"' in result
    assert 'calc(100% - 2px)' in result
    assert '--space: 1px 2px' in result
    assert '/* top */' not in result


def test_css_bundle_keeps_import_order_and_rebases_urls(tmp_path):
    (tmp_path / 'css').mkdir()
    (tmp_path / 'css/one.css').write_text('.first { color: red; background:url(../assets/test.svg?q=1#icon) }')
    (tmp_path / 'css/two.css').write_text('.last { color: blue }')
    source = tmp_path / 'styles.css'
    source.write_text('@import url("./css/one.css?v=old"); @import "css/two.css";')
    result = tinycss2.serialize(css.collect_rules(source, tmp_path))
    assert result.index('.first') < result.index('.last')
    assert '../assets/test.svg?q=1#icon' in result
    assert '@import' not in result


@pytest.mark.parametrize('source', ['@import "missing.css" screen;', '@import "../outside.css";', '@import "styles.css";'])
def test_css_bundle_rejects_unsafe_or_conditional_imports(tmp_path, source):
    path = tmp_path / 'styles.css'
    path.write_text(source)
    with pytest.raises(ValueError):
        css.collect_rules(path, tmp_path)


def test_inline_custom_property_comments_do_not_join_tokens(tmp_path):
    path = tmp_path / 'styles.css'
    path.write_text('.a{--value:red/**/blue;content:"\\26  ";}')
    result = tinycss2.serialize(css.collect_rules(path, tmp_path))
    rules = tinycss2.parse_stylesheet(result)
    values = tinycss2.parse_declaration_list(rules[0].content)
    assert [token.value for token in values[0].value if token.type == 'ident'] == ['red', 'blue']


def test_lazy_board_styles_are_compacted_hashed_and_repeatable(tmp_path, capsys):
    import hashlib
    import json

    (tmp_path / 'css').mkdir()
    (tmp_path / 'js/ui').mkdir(parents=True)
    (tmp_path / 'index.html').write_text('<link rel="stylesheet" href="./styles.css">')
    (tmp_path / 'styles.css').write_text('.app { color: red; }')
    board_source = '/* lazy */ .board { background: url(../assets/grid.svg); color: blue; }'
    (tmp_path / 'css/boards.css').write_text(board_source)
    module = tmp_path / 'js/ui/boards.js'
    module.write_text('const u = new URL("../../css/boards.css", import.meta.url); u.searchParams.set("v", "pinned");')
    css.build_css(tmp_path)
    report = json.loads(capsys.readouterr().out)
    board = report['lazy']['boards']
    content = (tmp_path / board['file']).read_bytes()
    assert hashlib.sha256(content).hexdigest() in board['file']
    assert b'../assets/grid.svg' in content
    assert b'/* lazy */' not in content
    assert f'../../{board["file"]}' in module.read_text()
    assert 'u.searchParams.set("v", "pinned")' in module.read_text()
    assert board['file'] not in (tmp_path / 'index.html').read_text()
    assert (tmp_path / 'css/boards.css').read_text() == board_source
    css.build_css(tmp_path)
    assert json.loads(capsys.readouterr().out) == report


def test_block_compaction_preserves_value_tokens_selectors_and_conditional_order(tmp_path):
    path = tmp_path / 'style.css'
    path.write_text('''
      .parent .child { content: "A  B"; width: calc(100% - 2px); color: red !important; --x: red/**/blue; }
      @media (max-width: 600px) { .parent .child { color: blue; } }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    ''')
    rules = css.collect_rules(path, tmp_path)
    css.compact_blocks(rules)
    result = tinycss2.serialize(rules)
    assert '.parent .child{content:"A  B";width:calc(100% - 2px);color:red!important;' in result
    assert result.index('color:red') < result.index('@media') < result.index('color:blue')
    assert '@keyframes fade' in result
    assert 'from{opacity:0;}to{opacity:1;}' in result
    values = tinycss2.parse_declaration_list(tinycss2.parse_stylesheet(result)[0].content)
    custom = next(value for value in values if value.type == 'declaration' and value.name == '--x')
    assert [token.value for token in custom.value if token.type == 'ident'] == ['red', 'blue']

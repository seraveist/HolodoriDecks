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

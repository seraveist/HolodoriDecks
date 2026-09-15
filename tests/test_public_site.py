"""Check crawler-visible pages and the untrusted text boundary in the real renderer."""
from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("localized_pages", ROOT / "scripts/build-localized-pages.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Document(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.elements = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    target = tmp_path_factory.mktemp("public-site")
    shutil.copy2(ROOT / "index.html", target / "index.html")
    shutil.copytree(ROOT / "js", target / "js")
    module.build_pages(target)
    return target


@pytest.mark.parametrize("locale,heading", [("ko", "홀로도리 편성기"), ("en", "Holodori DeckSim"), ("ja", "ホロドリ編成シミュレーター")])
def test_language_pages_are_translated_before_javascript(site, locale, heading):
    source = (site / locale / "index.html").read_text(encoding="utf-8")
    elements = Document(source).elements
    assert next(attrs for tag, attrs in elements if tag == "html")["lang"] == locale
    selected = [attrs["value"] for tag, attrs in elements if tag == "option" and "selected" in attrs and attrs.get("value") in module.LOCALES]
    assert selected == [locale]
    canonical = [attrs["href"] for tag, attrs in elements if tag == "link" and attrs.get("rel") == "canonical"]
    assert canonical == [f"https://holosims.net/{locale}/"]
    alternates = {attrs["hreflang"]: attrs["href"] for tag, attrs in elements if tag == "link" and attrs.get("rel") == "alternate"}
    assert alternates == {**{key: f"https://holosims.net/{key}/" for key in module.LOCALES}, "x-default": "https://holosims.net/"}
    assert heading in source
    assert any(tag == "a" and attrs.get("href") == "#main-content" for tag, attrs in elements)
    assert any(tag == "script" and attrs.get("src", "").startswith("/js/app.js?") for tag, attrs in elements)
    assert not any(attrs.get("src", "").startswith("./") or attrs.get("href", "").startswith("./") for _, attrs in elements)
    assert not any(key.startswith("on") for _, attrs in elements for key in attrs)
    csp = next(attrs["content"] for tag, attrs in elements if tag == "meta" and attrs.get("http-equiv") == "Content-Security-Policy")
    assert "script-src 'self';" in csp
    assert all("src" in attrs for tag, attrs in elements if tag == "script")


def test_sitemap_and_robots_list_canonical_pages(site):
    sitemap = ElementTree.parse(site / "sitemap.xml")
    assert {node.text for node in sitemap.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")} == {f"https://holosims.net/{locale}/" for locale in module.LOCALES}
    assert "Sitemap: https://holosims.net/sitemap.xml" in (site / "robots.txt").read_text()


def test_upstream_character_name_cannot_create_event_attributes():
    source = f'''
import {{ renderMemberSlots }} from {json.dumps((ROOT / 'js/ui/member.js').as_uri())};
const card = {{id:'audit-card', rarity:3, attribute:1, character_name:'Audit" onpointerenter="void(0)" data-tail="', name:'<img src=x onerror=void(0)>'}};
const container = {{innerHTML:'', querySelectorAll:()=>[]}};
renderMemberSlots(container, new Map([[card.id,card]]), {{members:[card.id], lockedSlots:[true], ownedCardSettings:{{}}}},()=>{{}},()=>{{}});
console.log(container.innerHTML);
'''
    result = subprocess.run(["node", "--input-type=module", "-e", source], check=True, capture_output=True, encoding="utf-8")
    elements = Document(result.stdout).elements
    assert not any(key.startswith("on") or key == "data-tail" for _, attrs in elements for key in attrs)
    label = next(attrs["aria-label"] for tag, attrs in elements if tag == "button" and attrs.get("class") == "member-slot-select")
    assert 'Audit" onpointerenter="void(0)"' in label


def test_nested_translation_replaces_text_without_breaking_following_controls():
    source = '<p data-i18n="intro">Old <strong>nested</strong> text</p><button id="next">Next</button>'
    result = module.render_page(source, "en", {"intro": 'New <unsafe> & "quoted"'})
    assert 'New &lt;unsafe&gt; &amp; &quot;quoted&quot;' in result
    assert '<button id="next">Next</button>' in result

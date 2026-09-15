#!/usr/bin/env python3
"""Render crawlable language pages from the same HTML and translations as the app."""
from __future__ import annotations

import argparse
import html
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path

LOCALES = ("ko", "en", "ja")
ORIGIN = "https://holosims.net"
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
THEME_LABELS = {"ko": "다크 모드로 전환", "en": "Switch to dark mode", "ja": "ダークモードに切り替え"}


class LocalizedPage(HTMLParser):
    def __init__(self, locale: str, translations: dict[str, str]):
        super().__init__(convert_charrefs=False)
        self.locale = locale
        self.translations = translations
        self.output: list[str] = []
        self.suppressed_depth: int | None = None

    def handle_starttag(self, tag, attrs):
        if self.suppressed_depth is not None:
            if tag not in VOID_TAGS:
                self.suppressed_depth += 1
            return
        attrs = dict(attrs)
        for suffix, target in (("placeholder", "placeholder"), ("aria-label", "aria-label"), ("title", "title")):
            if key := attrs.get(f"data-i18n-{suffix}"):
                attrs[target] = self.translations[key]
        if tag == "html":
            attrs["lang"] = self.locale
        if tag == "meta" and attrs.get("name") == "description":
            attrs["content"] = self.translations["app.description"]
        if tag == "link" and attrs.get("rel") == "canonical":
            attrs["href"] = f"{ORIGIN}/{self.locale}/"
        if tag == "option" and attrs.get("value") in LOCALES:
            attrs.pop("selected", None)
            if attrs["value"] == self.locale:
                attrs["selected"] = None
        if attrs.get("id") == "theme-toggle":
            attrs["aria-label"] = attrs["title"] = THEME_LABELS[self.locale]
        # These pages share the app and media at the domain root.
        for key in ("href", "src"):
            if str(attrs.get(key, "")).startswith("./"):
                attrs[key] = attrs[key][1:]
        attribute_text = "".join(f" {key}" if value is None else f' {key}="{html.escape(value, quote=True)}"' for key, value in attrs.items())
        self.output.append(f"<{tag}{attribute_text}>")
        initial_counters = {"owned-count": "owned.count", "owned-visible-count": "owned.total", "card-count": "picker.ownedCount"}
        key = "app.title" if tag == "title" else attrs.get("data-i18n") or initial_counters.get(attrs.get("id"))
        if key and tag not in VOID_TAGS:
            text = self.translations[key]
            if attrs.get("id") in initial_counters:
                text = text.format(count=0, owned=0, visible=0)
            self.output.append(html.escape(text))
            self.suppressed_depth = 0

    def handle_endtag(self, tag):
        if self.suppressed_depth is not None:
            if self.suppressed_depth:
                self.suppressed_depth -= 1
                return
            self.suppressed_depth = None
        self.output.append(f"</{tag}>")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self.suppressed_depth is None:
            self.output.append(data)

    def handle_entityref(self, name):
        self.handle_data(f"&{name};")

    def handle_charref(self, name):
        self.handle_data(f"&#{name};")

    def handle_decl(self, decl):
        self.output.append(f"<!{decl}>")

    def handle_comment(self, data):
        if self.suppressed_depth is None:
            self.output.append(f"<!--{data}-->")


def render_page(source: str, locale: str, translations: dict[str, str]) -> str:
    parser = LocalizedPage(locale, translations)
    parser.feed(source)
    parser.close()
    return "".join(parser.output)


def build_pages(root: Path) -> None:
    root = root.resolve()
    source = (root / "index.html").read_text(encoding="utf-8")
    module_url = (root / "js" / "i18n.js").as_uri()
    export = f'import {{ getUiTranslations }} from {json.dumps(module_url)}; console.log(JSON.stringify(Object.fromEntries(["ko","en","ja"].map(locale => [locale, getUiTranslations(locale)]))));'
    result = subprocess.run(["node", "--input-type=module", "-e", export], check=True, capture_output=True, encoding="utf-8")
    translations = json.loads(result.stdout)
    for locale in LOCALES:
        target = root / locale / "index.html"
        target.parent.mkdir(exist_ok=True)
        target.write_text(render_page(source, locale, translations[locale]), encoding="utf-8")
    urls = "\n".join(f"  <url><loc>{ORIGIN}/{locale}/</loc></url>" for locale in LOCALES)
    (root / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n', encoding="utf-8")
    (root / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {ORIGIN}/sitemap.xml\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    build_pages(parser.parse_args().root)
    print("[pages] KO / EN / JA HTML, sitemap.xml and robots.txt generated")

#!/usr/bin/env python3
"""Bundle local styles in cascade order; compact tokens without rewriting values."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import tinycss2


class Stylesheets(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.links = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        href = attrs.get('href', '')
        if tag == 'link' and attrs.get('rel') == 'stylesheet' and href.startswith('./'):
            if attrs.get('media') or 'disabled' in attrs:
                raise ValueError('Conditional stylesheets need an explicit bundling policy')
            self.links.append((self.get_starttag_text(), href))


def normalize_tokens(tokens, source, root):
    result = []
    for token in tokens:
        if token.type == 'error':
            raise ValueError(f'Invalid CSS in {source}: {token.message}')
        if token.type == 'comment':
            continue
        if token.type == 'whitespace':
            if result and result[-1].type == 'whitespace':
                continue
            token.value = ' '
        if token.type == 'url' or (token.type == 'function' and token.lower_name == 'url'):
            args = getattr(token, 'arguments', [])
            significant = [t for t in args if t.type not in ('whitespace', 'comment')]
            value = token.value if token.type == 'url' else (
                significant[0].value if len(significant) == 1 and significant[0].type == 'string' else None)
            if value:
                parts = urlsplit(value)
                if not parts.scheme and not parts.netloc and parts.path and not parts.path.startswith('/'):
                    absolute = (source.parent / parts.path).resolve()
                    if not absolute.is_relative_to(root):
                        raise ValueError(f'CSS asset leaves public root: {value}')
                    relative = Path(os.path.relpath(absolute, root / 'css')).as_posix()
                    rebased = urlunsplit(('', '', relative, parts.query, parts.fragment))
                    token = tinycss2.parse_component_value_list(f'url({json.dumps(rebased, ensure_ascii=False)})')[0]
        else:
            for attribute in ('prelude', 'content', 'arguments'):
                nested = getattr(token, attribute, None)
                if nested is not None:
                    setattr(token, attribute, normalize_tokens(nested, source, root))
        result.append(token)
    return result


def collect_rules(source: Path, root: Path, stack=()):
    source = source.resolve()
    if not source.is_relative_to(root) or source in stack:
        raise ValueError(f'Invalid/cyclic stylesheet import: {source}')
    rules = tinycss2.parse_stylesheet(source.read_text(encoding='utf-8'), skip_comments=True, skip_whitespace=True)
    result = []
    for rule in rules:
        if rule.type == 'at-rule' and rule.lower_at_keyword == 'import':
            tokens = [t for t in rule.prelude if t.type not in ('whitespace', 'comment')]
            if len(tokens) != 1:
                raise ValueError('Conditional @import is not flattened automatically')
            token = tokens[0]
            if token.type in ('string', 'url'):
                href = token.value
            elif token.type == 'function' and token.lower_name == 'url':
                args = [t for t in token.arguments if t.type not in ('whitespace', 'comment')]
                if len(args) != 1 or args[0].type != 'string':
                    raise ValueError('Unsupported @import URL')
                href = args[0].value
            else:
                raise ValueError('Unsupported @import')
            parts = urlsplit(href)
            if parts.scheme or parts.netloc or parts.path.startswith('/'):
                raise ValueError('Only local relative @import is flattened')
            result.extend(collect_rules(source.parent / parts.path, root, (*stack, source)))
        else:
            result.extend(normalize_tokens([rule], source, root))
    return result


def build_css(root: Path):
    root = root.resolve()
    index = root / 'index.html'
    source = index.read_text(encoding='utf-8')
    links = Stylesheets(source).links
    if not links:
        raise ValueError('No local stylesheet entrypoints found')
    rules = []
    for _, href in links:
        rules.extend(collect_rules(root / urlsplit(href).path, root))
    content = (tinycss2.serialize(rules) + '\n').encode('utf-8')
    digest = hashlib.sha256(content).hexdigest()
    output = root / 'css' / f'site.{digest}.css'
    output.parent.mkdir(exist_ok=True)
    output.write_bytes(content)
    for number, (tag, _) in enumerate(links):
        replacement = f'<link rel="stylesheet" href="./css/{output.name}">' if number == 0 else ''
        source = source.replace(tag, replacement, 1)
    index.write_text(source, encoding='utf-8')
    print(json.dumps({'file': f'css/{output.name}', 'bytes': len(content), 'rules': len(rules)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    build_css(parser.parse_args().root)

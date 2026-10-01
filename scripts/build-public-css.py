#!/usr/bin/env python3
"""Bundle local styles in cascade order; compact tokens without rewriting values."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
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


def compact_blocks(rules):
    """Remove block/declaration padding without changing selectors or value tokens."""
    for rule in rules:
        if rule.type == 'qualified-rule':
            while rule.prelude and rule.prelude[0].type == 'whitespace':
                rule.prelude.pop(0)
            while rule.prelude and rule.prelude[-1].type == 'whitespace':
                rule.prelude.pop()
            declarations = tinycss2.parse_declaration_list(rule.content, skip_comments=True, skip_whitespace=True)
            # Preserve unsupported/new nesting syntax verbatim instead of
            # guessing which whitespace separates its selectors or values.
            if any(item.type != 'declaration' for item in declarations):
                continue
            for declaration in declarations:
                if declaration.name.startswith('--'):
                    continue
                while declaration.value and declaration.value[0].type == 'whitespace':
                    declaration.value.pop(0)
                while declaration.value and declaration.value[-1].type == 'whitespace':
                    declaration.value.pop()
            rule.content = tinycss2.parse_component_value_list(tinycss2.serialize(declarations))
        elif rule.type == 'at-rule' and rule.content is not None and rule.lower_at_keyword in {
            'media', 'supports', 'container', 'layer', 'keyframes', '-webkit-keyframes',
        }:
            nested = tinycss2.parse_rule_list(rule.content, skip_comments=True, skip_whitespace=True)
            compact_blocks(nested)
            rule.content = tinycss2.parse_component_value_list(tinycss2.serialize(nested))


def write_bundle(root: Path, name: str, rules):
    compact_blocks(rules)
    content = (tinycss2.serialize(rules) + '\n').encode('utf-8')
    digest = hashlib.sha256(content).hexdigest()
    output = root / 'css' / f'{name}.{digest}.css'
    output.parent.mkdir(exist_ok=True)
    output.write_bytes(content)
    return {'file': f'css/{output.name}', 'bytes': len(content), 'rules': len(rules)}


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
    report = write_bundle(root, 'site', rules)
    for number, (tag, _) in enumerate(links):
        replacement = f'<link rel="stylesheet" href="./{report["file"]}">' if number == 0 else ''
        source = source.replace(tag, replacement, 1)
    index.write_text(source, encoding='utf-8')
    # Board styles remain a separate request made only when opening that view.
    board_styles = root / 'css/boards.css'
    if board_styles.is_file():
        board = write_bundle(root, 'boards', collect_rules(board_styles, root))
        module = root / 'js/ui/boards.js'
        text, count = re.subn(r'(["\x27])\.\./\.\./css/boards(?:\.[0-9a-f]{64})?\.css\1',
                             json.dumps(f'../../{board["file"]}'), module.read_text(encoding='utf-8'))
        if count != 1:
            raise ValueError('Expected exactly one lazy board stylesheet reference')
        module.write_text(text, encoding='utf-8')
        report['lazy'] = {'boards': board}
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    build_css(parser.parse_args().root)

#!/usr/bin/env python3
"""Treat only HTTP 404 as absent; network/auth errors must stop publication."""
import argparse
import os
import re
import subprocess


def exists(endpoint: str, *, run=subprocess.run) -> bool:
    result = run(['gh', 'api', endpoint], capture_output=True, text=True)
    if result.returncode == 0:
        return True
    if re.search(r'\(HTTP 404\)', result.stderr):
        return False
    raise RuntimeError(f'Unable to check release state: {result.stderr.strip()}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default=os.environ.get('GITHUB_REPOSITORY'))
    parser.add_argument('--tag', required=True)
    args = parser.parse_args()
    if not args.repo or not re.fullmatch(r'v\d+\.\d+\.\d+', args.tag):
        parser.error('A repository and semantic version tag are required')
    prefix = f'repos/{args.repo}'
    rows = {'tag_exists': exists(f'{prefix}/git/ref/tags/{args.tag}'),
            'release_exists': exists(f'{prefix}/releases/tags/{args.tag}')}
    lines = '\n'.join(f'{key}={str(value).lower()}' for key, value in rows.items()) + '\n'
    print(lines, end='')
    if output := os.environ.get('GITHUB_OUTPUT'):
        with open(output, 'a', encoding='utf-8') as stream:
            stream.write(lines)


if __name__ == '__main__':
    main()

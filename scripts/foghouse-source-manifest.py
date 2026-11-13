#!/usr/bin/env python3
"""Hash a reviewed local build context; never hash ignored files or secret candidates.

Supports this checkout's simple Dockerignore glob subset. Unsupported syntax fails
closed rather than pretending to implement the complete Docker pattern language.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys


def pattern_regex(pattern):
    if any(char in pattern for char in ('[', ']', '\\', '{', '}')):
        raise ValueError('Unsupported .dockerignore pattern syntax; review the manifest helper first.')
    result = ''
    index = 0
    while index < len(pattern):
        if pattern[index:index + 3] == '**/':
            result += '(?:.*/)?'
            index += 3
        elif pattern[index:index + 2] == '**':
            result += '.*'
            index += 2
        elif pattern[index] == '*':
            result += '[^/]*'
            index += 1
        elif pattern[index] == '?':
            result += '[^/]'
            index += 1
        else:
            result += re.escape(pattern[index])
            index += 1
    return re.compile('^' + result + '$')


def manifest(root):
    ignore_path = root / '.dockerignore'
    if not ignore_path.is_file() or ignore_path.is_symlink():
        raise ValueError('A regular reviewed .dockerignore is required.')
    if any((root / name).exists() for name in ('.containerignore', 'Dockerfile.dockerignore', 'Containerfile.dockerignore')):
        raise ValueError('Alternate ignore files require explicit manifest-helper review.')
    patterns = []
    for line in ignore_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        include = line.startswith('!')
        pattern = line[1:] if include else line
        pattern = pattern.strip('/')
        if not pattern or '..' in pattern.split('/'):
            raise ValueError('Unsupported empty/parent ignore pattern.')
        if include and any(char in pattern for char in ('/', '*', '?')):
            raise ValueError('Only literal root-file reinclusion is supported; review the helper first.')
        patterns.append((include, pattern_regex(pattern)))

    def ignored(relative):
        parts = relative.split('/')
        candidates = ['/'.join(parts[:index]) for index in range(1, len(parts) + 1)]
        excluded = False
        for include, expression in patterns:
            if any(expression.fullmatch(candidate) for candidate in candidates):
                excluded = not include
        return excluded

    def secret_candidate(name):
        lower = name.lower()
        return (lower in {'runtime.env', 'credentials', 'secrets', 'backups', 'database', 'databases', '.aws', '.ssh'}
                or lower == '.env' or lower.startswith('.env.')
                or lower.endswith(('.pem', '.key', '.dump', '.sqlite', '.sqlite3', '.db')))

    records = []
    for current, directories, files in os.walk(root, followlinks=False):
        directories.sort()
        files.sort()
        for name in list(directories):
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            if ignored(relative):
                directories.remove(name)
            elif path.is_symlink() or secret_candidate(name) or name in {'.git', 'node_modules'}:
                raise ValueError('Unsafe or unignored sensitive directory in build context; review exclusions.')
        for name in files:
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            if ignored(relative) and relative != '.dockerignore':
                continue
            metadata = path.lstat()
            if not stat.S_ISREG(metadata.st_mode) or secret_candidate(name):
                raise ValueError('Unsafe or unignored sensitive file in build context; review exclusions.')
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            records.append({'path': relative, 'sha256': digest.hexdigest(), 'mode': stat.S_IMODE(metadata.st_mode)})
    records.sort(key=lambda item: item['path'])
    encoded = json.dumps(records, sort_keys=True, separators=(',', ':')).encode()
    return {'format': 1, 'source_sha256': hashlib.sha256(encoded).hexdigest(), 'files': records,
            'scope': 'Reviewed Dockerignore subset; source content and modes, not a Git revision or reproducible image guarantee.'}


if __name__ == '__main__':
    try:
        print(json.dumps(manifest(Path(sys.argv[1]).resolve()), indent=2, sort_keys=True))
    except (ValueError, OSError, IndexError) as error:
        print(f'Source manifest refused: {error}', file=sys.stderr)
        sys.exit(1)

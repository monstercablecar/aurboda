#!/usr/bin/env python3
"""Stubbed release-script checks: no daemon, network, backup or service is used."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('foghouse-update.sh')
HELPER = Path(__file__).with_name('foghouse-source-manifest.py')


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'source').mkdir()
        (self.root / 'scripts').mkdir()
        (self.root / 'bin').mkdir()
        (self.root / 'source/.dockerignore').write_text('.git\nnode_modules\n**/node_modules\n.env\n.env.*\ndocs\n*.md\n!README.md\ndist\nbuild\n')
        (self.root / 'source/Dockerfile').write_text('FROM scratch\n')
        (self.root / 'source/app.txt').write_text('reviewed source\n')
        (self.root / 'source/.env').write_text('ignored fixture, not credentials\n')
        (self.root / 'source/README.md').write_text('included\n')
        self.write_executable('scripts/backup.sh', 'printf "backup\\n" >> "$MOCK_LOG"\nprintf "fixture-backup\\n"\n')
        self.write_executable('bin/podman', '''printf 'podman %s\\n' "$*" >> "$MOCK_LOG"
if [[ "$1" == build && "${MOCK_BUILD_FAIL:-}" == 1 ]]; then exit 7; fi
if [[ "$1" == image ]]; then printf 'sha256:fixture\\n'; fi
''')
        self.write_executable('bin/systemctl', 'printf "restart\\n" >> "$MOCK_LOG"\n')
        self.write_executable('bin/curl', 'printf \'{"success":true,"version":"%s"}\\n\' "${MOCK_VERSION:-release-123}"\n')
        self.write_executable('bin/sleep', 'exit 0\n')
        self.env = dict(os.environ, FOGHOUSE_INSTALL_ROOT=str(self.root), MOCK_LOG=str(self.root / 'calls'), PATH=str(self.root / 'bin') + os.pathsep + os.environ['PATH'])
        self.env.pop('BUILD_SHA', None)

    def write_executable(self, relative, body):
        target = self.root / relative
        target.write_text('#!/usr/bin/env bash\nset -eu\n' + body)
        target.chmod(0o700)

    def run_update(self, *args, **env):
        return subprocess.run(['bash', str(SCRIPT), *args], env=dict(self.env, **env), capture_output=True, text=True)

    def calls(self):
        path = self.root / 'calls'
        return path.read_text() if path.exists() else ''

    def test_missing_legacy_and_unsafe_labels_fail_before_backup(self):
        for label in (None, 'foghouse-career', 'bad;touch injected'):
            result = self.run_update(*([] if label is None else [label]))
            self.assertEqual(result.returncode, 2)
        self.assertEqual(self.calls(), '')
        self.assertFalse((self.root / 'releases').exists())

    def test_build_failure_never_restarts(self):
        result = self.run_update('release-123', MOCK_BUILD_FAIL='1')
        self.assertEqual(result.returncode, 7)
        self.assertIn('backup', self.calls())
        self.assertNotIn('restart', self.calls())
        self.assertIn('failed exit=7', next((self.root / 'releases').glob('*/events.log')).read_text())

    def test_wrong_running_version_fails_even_with_http_success(self):
        result = self.run_update('release-123', MOCK_VERSION='old-release')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('restart', self.calls())
        self.assertIn('did not report the requested release', result.stderr)

    def test_matching_version_records_label_hash_and_image(self):
        result = self.run_update(BUILD_SHA='release-123')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('BUILD_SHA=release-123', self.calls())
        record = next((self.root / 'releases').glob('*/source-manifest.json'))
        manifest = json.loads(record.read_text())
        self.assertEqual(len(manifest['source_sha256']), 64)
        paths = [item['path'] for item in manifest['files']]
        self.assertNotIn('.env', paths)
        self.assertIn('README.md', paths)
        self.assertEqual(record.stat().st_mode & 0o777, 0o600)
        self.assertIn('healthy label=release-123', record.with_name('events.log').read_text())

    def test_manifest_reproducible_and_ignored_changes_do_not_affect_hash(self):
        def get():
            result = subprocess.run(['python3', str(HELPER), str(self.root / 'source')], capture_output=True, text=True, check=True)
            return json.loads(result.stdout)['source_sha256']
        initial = get()
        (self.root / 'source/.env').write_text('different ignored fixture\n')
        self.assertEqual(get(), initial)
        (self.root / 'source/app.txt').write_text('changed source\n')
        self.assertNotEqual(get(), initial)

    def test_reviewed_agent_cache_and_documentation_symlink_exclusions(self):
        source = self.root / 'source'
        (source / 'tryouts').mkdir()
        (source / 'tryouts/CLAUDE.md').symlink_to('/nonexistent/not-read')
        cache = source / '.letta/worktrees/example'
        cache.mkdir(parents=True)
        (cache / '.env.example').write_text('fixture excluded without reading\n')
        (cache / 'CLAUDE.md').symlink_to('/nonexistent/not-read')
        with (source / '.dockerignore').open('a') as stream:
            stream.write('.letta\ntryouts/CLAUDE.md\n')
        result = self.run_update('release-123')
        self.assertEqual(result.returncode, 0, result.stderr)
        record = next((self.root / 'releases').glob('*/source-manifest.json'))
        paths = [item['path'] for item in json.loads(record.read_text())['files']]
        self.assertFalse(any(path.startswith('.letta/') for path in paths))
        self.assertNotIn('tryouts/CLAUDE.md', paths)

    def test_unignored_sensitive_file_and_unsupported_patterns_fail_closed(self):
        (self.root / 'source/runtime.env').write_text('fixture\n')
        result = self.run_update('release-123')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), '')
        (self.root / 'source/runtime.env').unlink()
        with (self.root / 'source/.dockerignore').open('a') as stream:
            stream.write('!docs/restore.md\n')
        result = self.run_update('release-123')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), '')


if __name__ == '__main__':
    unittest.main()

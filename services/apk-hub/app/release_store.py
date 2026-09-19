"""Atomic package replacement for the fixed Jinling distribution entry."""
import hashlib
import os
import re
import secrets
import threading
import time
from pathlib import Path

JINLING_PACKAGE = 'com.jinling.mahjong'
JINLING_SLUG = 'jinling-mahjong'
SAFE_FILE = re.compile(r'(?:packages/[a-f0-9]{24}(?:-[a-f0-9]{64})?\.(?:apk|ipa)|icons/[a-f0-9]{24}(?:-[a-f0-9]{64})?\.png)')


class ReleaseStore:
    def __init__(self, data, connect):
        self.data, self.connect = Path(data), connect
        self.lock = threading.RLock()
        (self.data / '.incoming').mkdir(mode=0o700, exist_ok=True)
        with self.connect() as c:
            c.executescript('''
                CREATE TABLE IF NOT EXISTS product_variants(
                    slug TEXT NOT NULL, platform TEXT NOT NULL, app_id TEXT NOT NULL UNIQUE,
                    PRIMARY KEY(slug,platform));
                CREATE TABLE IF NOT EXISTS app_aliases(alias_id TEXT PRIMARY KEY, app_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS pending_file_deletions(path TEXT PRIMARY KEY);
            ''')

    @staticmethod
    def _rank(row):
        build = tuple(int(x) for x in re.findall(r'\d+', str(row['version_code'] or '')))
        return (bool(row['published']), build, int(row['created'] or 0), row['id'])

    def resolve(self, c, ident):
        row = c.execute('SELECT * FROM apps WHERE id=?', (ident,)).fetchone()
        if row:
            return row
        return c.execute('SELECT a.* FROM app_aliases x JOIN apps a ON a.id=x.app_id WHERE x.alias_id=?', (ident,)).fetchone()

    def _files(self, row):
        row = dict(row)
        files = {'packages/' + str(row['filename']), 'icons/' + row['id'] + '.png'}
        if (row.get('icon_url') or '').startswith('/icons/'):
            files.add(row['icon_url'].lstrip('/'))
        return {p for p in files if SAFE_FILE.fullmatch(p)}

    def _referenced(self, c, path):
        if path.startswith('packages/'):
            return c.execute('SELECT 1 FROM apps WHERE filename=?', (path.split('/', 1)[1],)).fetchone()
        return c.execute('SELECT 1 FROM apps WHERE icon_url=? OR (id=? AND (icon_url IS NULL OR icon_url=""))',
                         ('/' + path, path.split('/', 1)[1].removesuffix('.png'))).fetchone()

    def _queue(self, c, files):
        for path in files:
            if SAFE_FILE.fullmatch(path):
                c.execute('INSERT OR IGNORE INTO pending_file_deletions VALUES(?)', (path,))

    def cleanup(self):
        removed = 0
        with self.lock, self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            for row in c.execute('SELECT path FROM pending_file_deletions').fetchall():
                path = row['path']
                if not SAFE_FILE.fullmatch(path) or self._referenced(c, path):
                    c.execute('DELETE FROM pending_file_deletions WHERE path=?', (path,))
                    continue
                try:
                    target = self.data / path
                    existed = target.exists()
                    target.unlink(missing_ok=True)
                except OSError:
                    continue  # Retry at the next startup/upload; never roll back a valid release.
                removed += int(existed)
                c.execute('DELETE FROM pending_file_deletions WHERE path=?', (path,))
        return removed

    def _compact(self, c, platform):
        rows = c.execute('SELECT * FROM apps WHERE package=? AND COALESCE(NULLIF(platform,""),"android")=?',
                         (JINLING_PACKAGE, platform)).fetchall()
        if not rows:
            return None, 0
        binding = c.execute('SELECT app_id FROM product_variants WHERE slug=? AND platform=?',
                            (JINLING_SLUG, platform)).fetchone()
        current = next((r for r in rows if binding and r['id'] == binding['app_id']), None)
        current = current or max(rows, key=self._rank)
        retained = self._files(current)
        downloads = sum(int(r['downloads'] or 0) for r in rows)
        for old in rows:
            if old['id'] == current['id']:
                continue
            c.execute('UPDATE app_aliases SET app_id=? WHERE app_id=?', (current['id'], old['id']))
            c.execute('INSERT OR REPLACE INTO app_aliases VALUES(?,?)', (old['id'], current['id']))
            c.execute('DELETE FROM apps WHERE id=?', (old['id'],))
            self._queue(c, self._files(old) - retained)
        c.execute('UPDATE apps SET downloads=?,platform=? WHERE id=?', (downloads, platform, current['id']))
        c.execute('INSERT INTO product_variants VALUES(?,?,?) ON CONFLICT(slug,platform) DO UPDATE SET app_id=excluded.app_id',
                  (JINLING_SLUG, platform, current['id']))
        return c.execute('SELECT * FROM apps WHERE id=?', (current['id'],)).fetchone(), len(rows) - 1

    def consolidate_jinling(self):
        platforms, removed = {}, 0
        with self.lock, self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            for platform in ('android', 'ios'):
                row, count = self._compact(c, platform)
                removed += count
                if row:
                    platforms[platform] = row['id']
            c.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_jinling_platform ON apps(package,platform) WHERE package='com.jinling.mahjong'")
        return {'platforms': platforms, 'removed': removed, 'cleaned_files': self.cleanup()}

    def variants(self, published_only=True):
        with self.connect() as c:
            rows = c.execute('SELECT a.* FROM product_variants v JOIN apps a ON a.id=v.app_id WHERE v.slug=?' +
                             (' AND a.published=1' if published_only else '') + ' ORDER BY v.platform', (JINLING_SLUG,)).fetchall()
            return rows

    def install_release(self, metadata, package_file, icon_file=None, values=None):
        metadata, values = dict(metadata), dict(values or {})
        package_file = Path(package_file)
        icon_file = Path(icon_file) if icon_file else None
        platform = metadata.get('platform') or ('ios' if package_file.suffix.lower() == '.ipa' else 'android')
        if platform not in ('android', 'ios') or not metadata.get('package') or not metadata.get('version'):
            raise ValueError('安装包缺少有效平台、应用标识或版本')
        digest = hashlib.sha256()
        with package_file.open('rb') as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        sha, size = digest.hexdigest(), package_file.stat().st_size
        if not size:
            raise ValueError('安装包为空')
        unified = metadata['package'] == JINLING_PACKAGE
        promoted, replaced = [], False
        try:
            with self.lock, self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                old, compacted = self._compact(c, platform) if unified else (None, 0)
                replaced = old is not None
                old_values = dict(old) if old else {}
                ident = old_values.get('id') or secrets.token_hex(12)
                suffix = '.ipa' if platform == 'ios' else '.apk'
                filename = ident + '-' + sha + suffix
                target = self.data / 'packages' / filename
                if not target.exists():
                    os.replace(package_file, target)
                    promoted.append('packages/' + filename)
                icon_url = old_values.get('icon_url') or ''
                if icon_file and icon_file.is_file() and metadata.get('icon_found'):
                    icon_name = ident + '-' + sha + '.png'
                    icon_target = self.data / 'icons' / icon_name
                    if not icon_target.exists():
                        os.replace(icon_file, icon_target)
                        promoted.append('icons/' + icon_name)
                    icon_url = '/icons/' + icon_name
                record = {
                    'id': ident, 'name': metadata['name'], 'version': metadata['version'], 'package': metadata['package'],
                    'description': values.get('description') or old_values.get('description') or '',
                    'notes': values.get('notes') or old_values.get('notes') or '',
                    'category': values.get('category') or old_values.get('category') or '实用工具',
                    'size': size, 'sha256': sha, 'filename': filename,
                    'published': int(old_values.get('published') or 0), 'downloads': int(old_values.get('downloads') or 0),
                    'created': int(time.time()), 'icon_url': icon_url, 'version_code': metadata.get('version_code', ''),
                    'parse_warning': metadata.get('parse_warning', ''), 'platform': platform,
                    'minimum_os_version': metadata.get('minimum_os_version', ''),
                    'ios_distribution': metadata.get('ios_distribution', ''),
                    'provisioning_expires_at': metadata.get('provisioning_expires_at', ''),
                    'ios_signed': int(bool(metadata.get('ios_signed'))),
                    'unlisted': int(old_values.get('unlisted', 1 if unified else 0)),
                }
                if old:
                    c.execute('UPDATE apps SET ' + ','.join(k + '=?' for k in record if k != 'id') + ' WHERE id=?',
                              [v for k, v in record.items() if k != 'id'] + [ident])
                    self._queue(c, self._files(old) - self._files(record))
                else:
                    c.execute('INSERT INTO apps(' + ','.join(record) + ') VALUES(' + ','.join('?' for _ in record) + ')', list(record.values()))
                if unified:
                    c.execute('INSERT INTO product_variants VALUES(?,?,?) ON CONFLICT(slug,platform) DO UPDATE SET app_id=excluded.app_id',
                              (JINLING_SLUG, platform, ident))
        except Exception:
            with self.connect() as c:
                for path in promoted:
                    if not self._referenced(c, path):
                        (self.data / path).unlink(missing_ok=True)
            raise
        finally:
            package_file.unlink(missing_ok=True)
            if icon_file:
                icon_file.unlink(missing_ok=True)
        return record, {'replaced': replaced, 'removed_records': compacted, 'cleaned_files': self.cleanup()}

    def delete_release(self, ident, name):
        with self.lock, self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT * FROM apps WHERE id=?', (ident,)).fetchone()
            if not row:
                return 404
            if name != row['name']:
                return 409
            self._queue(c, self._files(row))
            c.execute('DELETE FROM apps WHERE id=?', (ident,))
            c.execute('DELETE FROM app_aliases WHERE app_id=? OR alias_id=?', (ident, ident))
            c.execute('DELETE FROM product_variants WHERE app_id=?', (ident,))
        self.cleanup()
        return 200

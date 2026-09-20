"""Private staging and explicit atomic publication for Jinling. Never signs packages."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import time

from release_store import JINLING_PACKAGE, JINLING_SLUG, SAFE_FILE


class ManagementError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code = status, code


def management_secret():
    filename = os.environ.get('MANAGEMENT_API_TOKEN_FILE', '').strip()
    if not filename:
        return None
    try:
        with open(filename, 'rb') as source:
            value = source.read(1025).strip()
        return value if 32 <= len(value) <= 1024 else None
    except OSError:
        return None


def authenticate_management(headers):
    expected = management_secret()
    if expected is None:
        raise ManagementError(404, 'MANAGEMENT_DISABLED', '管理发布接口未启用')
    if not hmac.compare_digest(headers.get('X-Management-Token', '').encode('utf-8'), expected):
        raise ManagementError(401, 'MANAGEMENT_UNAUTHORIZED', '管理服务认证失败')
    actor = headers.get('X-Management-Actor', '')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}', actor):
        raise ManagementError(403, 'MANAGEMENT_ACTOR_REQUIRED', '缺少有效的管理账号身份')
    return actor


def build_key(value, platform):
    value = str(value or '')
    pattern = r'\d{1,18}' if platform == 'android' else r'\d{1,18}(?:\.\d{1,18}){0,2}'
    if not re.fullmatch(pattern, value) or not any(int(part) for part in value.split('.')):
        raise ManagementError(400, 'INVALID_BUILD', '安装包 Build 必须是有效的正数版本号')
    parts = tuple(int(part) for part in value.split('.'))
    return parts + (0,) * (3 - len(parts))


def file_digest(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ManagementError(409, 'PACKAGE_CHANGED', '安装包文件缺失或已变化，请重新上传')
    digest, size = hashlib.sha256(), 0
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


SAME_BUILD_WARNING = '同 Build 仅用于修复，确认发布后也不会触发客户端自动更新。'


class ManagementReleases:
    def __init__(self, releases, app_response, ios_status):
        self.releases = releases
        self.data, self.connect, self.lock = releases.data, releases.connect, releases.lock
        self.app_response, self.ios_status = app_response, ios_status
        self.staging = self.data / '.staged'
        self.staging.mkdir(mode=0o700, exist_ok=True)
        if self.staging.is_symlink():
            raise ValueError('暂存目录不能是符号链接')
        with self.connect() as c:
            c.executescript('''
                CREATE TABLE IF NOT EXISTS management_release_drafts(
                    id TEXT PRIMARY KEY, platform TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('draft','published','discarded')),
                    metadata TEXT NOT NULL, filename TEXT NOT NULL, icon_filename TEXT NOT NULL,
                    sha256 TEXT NOT NULL, size INTEGER NOT NULL, notes TEXT NOT NULL,
                    created_at INTEGER NOT NULL, created_by TEXT NOT NULL,
                    published_at INTEGER, published_by TEXT, app_id TEXT);
                CREATE TABLE IF NOT EXISTS management_release_history(
                    id TEXT PRIMARY KEY, release_id TEXT NOT NULL, stage TEXT NOT NULL,
                    actor TEXT NOT NULL, at INTEGER NOT NULL, metadata TEXT NOT NULL, message TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS management_release_history_time ON management_release_history(at);
            ''')
        self.cleanup()

    def _path(self, draft, icon=False):
        suffix = '.png' if icon else ('.ipa' if draft['platform'] == 'ios' else '.apk')
        filename = draft['icon_filename' if icon else 'filename']
        if (not re.fullmatch(r'[a-f0-9]{24}', draft['id']) or filename != draft['id'] + suffix
                or self.staging.is_symlink()):
            raise ManagementError(409, 'PACKAGE_CHANGED', '待发布文件路径无效，请重新上传')
        return self.staging / filename

    def cleanup(self):
        with self.lock, self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            referenced = set()
            for row in c.execute("SELECT filename,icon_filename FROM management_release_drafts WHERE status='draft'"):
                referenced.update((row['filename'], row['icon_filename']))
            for candidate in self.staging.iterdir():
                if re.fullmatch(r'[a-f0-9]{24}\.(?:apk|ipa|png)', candidate.name) and candidate.name not in referenced:
                    try:
                        candidate.unlink(missing_ok=True)
                    except OSError:
                        pass
        self.releases.cleanup()

    def _current(self, c, platform):
        rows = c.execute('SELECT * FROM apps WHERE package=? AND COALESCE(NULLIF(platform,""),"android")=?',
                         (JINLING_PACKAGE, platform)).fetchall()
        binding = c.execute('SELECT app_id FROM product_variants WHERE slug=? AND platform=?',
                            (JINLING_SLUG, platform)).fetchone()
        return next((row for row in rows if binding and row['id'] == binding['app_id']), None) or (
            max(rows, key=self.releases._rank) if rows else None)

    def _validation(self, metadata, current=None):
        errors, warnings = [], []
        if metadata.get('parse_warning'):
            warnings.append(str(metadata['parse_warning']))
        current_build = str(current['version_code'] or '') if current else None
        same_build = False
        if current:
            try:
                candidate = build_key(metadata['version_code'], metadata['platform'])
                active = build_key(current_build, metadata['platform'])
                if candidate < active:
                    errors.append('Build 低于当前版本，不能降级发布')
                same_build = candidate == active
            except ManagementError:
                errors.append('当前版本 Build 无法确认，请先核对当前发布记录')
        if same_build:
            warnings.append(SAME_BUILD_WARNING)
        note = '安装时由 Android 最终校验安装包签名。'
        if metadata['platform'] == 'ios':
            ready, note = self.ios_status(metadata)
            if not ready:
                errors.append(note)
            warnings.append('签名描述文件和代码签名资源的解析不代表密码学验签成功，也不保证设备能够安装。')
        return {'canPublish': not errors, 'errors': errors, 'warnings': warnings,
                'currentBuild': current_build, 'sameBuild': same_build,
                'requiresSameBuildConfirmation': same_build, 'installationVerificationRequired': False}, note

    def _response(self, c, row):
        metadata = dict(row)
        metadata['platform'] = metadata.get('platform') or 'android'
        event = c.execute('''SELECT * FROM management_release_history WHERE stage='published'
            AND json_extract(metadata,'$.appId')=? AND json_extract(metadata,'$.sha256')=? ORDER BY at DESC,id DESC LIMIT 1''',
                          (row['id'], row['sha256'])).fetchone()
        event_data = json.loads(event['metadata']) if event else {}
        draft = c.execute('SELECT * FROM management_release_drafts WHERE id=?', (event['release_id'],)).fetchone() if event else None
        validation, note = self._validation(metadata)
        if event_data.get('sameBuild'):
            validation['sameBuild'] = True
            validation['warnings'].append(SAME_BUILD_WARNING)
        public = self.app_response(row)
        return {'id': row['id'], 'platform': metadata['platform'], 'stage': 'published',
                'name': metadata['name'], 'packageId': metadata['package'], 'version': metadata['version'],
                'build': str(metadata.get('version_code') or ''), 'size': row['size'], 'sha256': row['sha256'],
                'notes': row['notes'] or '', 'createdAt': draft['created_at'] if draft else event['at'] if event else int(row['created'] or 0) * 1000,
                'createdBy': draft['created_by'] if draft else event['actor'] if event else None, 'publishedAt': event['at'] if event else None,
                'publishedBy': event['actor'] if event else None, 'productUrl': public.get('product_url', ''),
                'downloadUrl': public.get('download_url', ''), 'minimumOsVersion': metadata.get('minimum_os_version', ''),
                'distribution': metadata.get('ios_distribution', '') if metadata['platform'] == 'ios' else '',
                'signingMetadataPresent': bool(metadata.get('ios_signed')) if metadata['platform'] == 'ios' else False,
                'provisioningExpiresAt': metadata.get('provisioning_expires_at') or None,
                'installationNote': note, 'validation': validation}

    def _draft_response(self, c, row):
        metadata = json.loads(row['metadata'])
        validation, note = self._validation(metadata, self._current(c, row['platform']))
        try:
            candidate = self._path(row)
            valid_file = candidate.is_file() and not candidate.is_symlink() and candidate.stat().st_size == row['size']
        except (ManagementError, OSError):
            valid_file = False
        if not valid_file:
            validation['canPublish'] = False
            validation['errors'].append('待发布文件缺失或已变化，请重新上传')
        return {'id': row['id'], 'platform': row['platform'], 'stage': 'draft', 'name': metadata['name'],
                'packageId': metadata['package'], 'version': metadata['version'], 'build': str(metadata['version_code']),
                'size': row['size'], 'sha256': row['sha256'], 'notes': row['notes'],
                'createdAt': row['created_at'], 'createdBy': row['created_by'], 'publishedAt': None, 'publishedBy': None,
                'productUrl': '', 'downloadUrl': '', 'minimumOsVersion': metadata.get('minimum_os_version', ''),
                'distribution': metadata.get('ios_distribution', '') if row['platform'] == 'ios' else '',
                'signingMetadataPresent': bool(metadata.get('ios_signed')) if row['platform'] == 'ios' else False,
                'provisioningExpiresAt': metadata.get('provisioning_expires_at') or None,
                'installationNote': note, 'validation': validation}

    def list(self):
        self.cleanup()
        with self.lock, self.connect() as c:
            current = [self._current(c, platform) for platform in ('android', 'ios')]
            return {'current': [self._response(c, row) for row in current if row and row['published']],
                    'drafts': [self._draft_response(c, row) for row in c.execute("SELECT * FROM management_release_drafts WHERE status='draft' ORDER BY created_at DESC,id")],
                    'history': [{**json.loads(row['metadata']), 'id': row['id'], 'releaseId': row['release_id'],
                                 'stage': row['stage'], 'actor': row['actor'], 'at': row['at'], 'message': row['message']}
                                for row in c.execute('SELECT * FROM management_release_history ORDER BY at DESC,id DESC LIMIT 100')]}

    def _event(self, c, ident, stage, actor, metadata, sha256, size, notes, message, app_id=None, same_build=False):
        fields = {'platform': metadata['platform'], 'version': metadata['version'],
                  'build': str(metadata.get('version_code') or ''), 'sha256': sha256, 'size': size, 'notes': notes,
                  'appId': app_id, 'sameBuild': same_build}
        c.execute('INSERT INTO management_release_history VALUES(?,?,?,?,?,?,?)',
                  (secrets.token_hex(12), ident, stage, actor, int(time.time() * 1000), json.dumps(fields, ensure_ascii=False), message))

    def stage(self, metadata, package_file, icon_file, notes, actor):
        metadata = dict(metadata)
        if metadata.get('package') != JINLING_PACKAGE:
            raise ManagementError(400, 'WRONG_PACKAGE', '这里只接受 com.jinling.mahjong 安装包')
        if (metadata.get('platform') not in ('android', 'ios') or not isinstance(metadata.get('version'), str)
                or not metadata['version'] or not isinstance(metadata.get('name'), str) or not metadata['name']):
            raise ManagementError(400, 'INVALID_PACKAGE', '安装包缺少真实的平台或版本信息')
        build_key(metadata.get('version_code'), metadata['platform'])
        sha, size = file_digest(package_file)
        if not size:
            raise ManagementError(400, 'EMPTY_PACKAGE', '安装包为空')
        ident, moved = secrets.token_hex(12), []
        try:
            with self.lock, self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                current = self._current(c, metadata['platform'])
                validation, _ = self._validation(metadata, current)
                if validation['errors']:
                    code = 'BUILD_DOWNGRADE' if '低于' in validation['errors'][0] else 'PACKAGE_NOT_INSTALLABLE'
                    raise ManagementError(409 if code == 'BUILD_DOWNGRADE' else 400, code, validation['errors'][0])
                if current and current['published'] and current['sha256'] == sha:
                    relative = 'packages/' + str(current['filename'])
                    if not SAFE_FILE.fullmatch(relative) or file_digest(self.data / relative) != (sha, size):
                        raise ManagementError(409, 'PACKAGE_CHANGED', '当前包文件校验异常，未改动线上版本')
                    return {'release': self._response(c, current), 'alreadyPublished': True}
                same = c.execute("SELECT * FROM management_release_drafts WHERE platform=? AND sha256=? AND status='draft' ORDER BY created_at,id LIMIT 1",
                                 (metadata['platform'], sha)).fetchone()
                if same:
                    if file_digest(self._path(same)) != (sha, size):
                        raise ManagementError(409, 'PACKAGE_CHANGED', '已有待发布包校验异常，请先丢弃后重新上传')
                    return {'draft': self._draft_response(c, same), 'alreadyStaged': True}
                suffix = '.ipa' if metadata['platform'] == 'ios' else '.apk'
                filename, icon_filename = ident + suffix, ''
                os.link(package_file, self.staging / filename)
                moved.append(self.staging / filename)
                if metadata.get('icon_found') and icon_file and Path(icon_file).is_file():
                    icon_filename = ident + '.png'
                    os.link(icon_file, self.staging / icon_filename)
                    moved.append(self.staging / icon_filename)
                directory_fd = os.open(self.staging, os.O_RDONLY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
                now = int(time.time() * 1000)
                c.execute('''INSERT INTO management_release_drafts
                    (id,platform,status,metadata,filename,icon_filename,sha256,size,notes,created_at,created_by)
                    VALUES(?,?,'draft',?,?,?,?,?,?,?,?)''',
                          (ident, metadata['platform'], json.dumps(metadata, ensure_ascii=False), filename,
                           icon_filename, sha, size, notes, now, actor))
                self._event(c, ident, 'staged', actor, metadata, sha, size, notes, '安装包校验通过，等待确认发布')
                row = c.execute('SELECT * FROM management_release_drafts WHERE id=?', (ident,)).fetchone()
                result = {'draft': self._draft_response(c, row)}
        except Exception:
            for candidate in moved:
                candidate.unlink(missing_ok=True)
            raise
        return result

    def _promote(self, source, relative, promoted):
        if not SAFE_FILE.fullmatch(relative):
            raise ManagementError(409, 'PACKAGE_CHANGED', '目标文件路径无效')
        target = self.data / relative
        if not target.exists():
            os.link(source, target)
            promoted.append(relative)
            with target.open('rb') as stream:
                os.fsync(stream.fileno())
            fd = os.open(target.parent, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        return target

    def publish(self, ident, request, actor):
        try:
            return self._publish(ident, request, actor)
        finally:
            self.cleanup()

    def _publish(self, ident, request, actor):
        if (not isinstance(request, dict) or not isinstance(request.get('sha256'), str)
                or not re.fullmatch(r'[a-f0-9]{64}', request['sha256']) or not isinstance(request.get('build'), str)
                or type(request.get('confirmSameBuild', False)) is not bool):
            raise ManagementError(400, 'INVALID_CONFIRMATION', '请核对待发布包的 SHA256、Build 和同 Build 确认信息')
        promoted, draft, metadata = [], None, None
        sha, size, notes = '', 0, ''
        try:
            with self.lock, self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                draft = c.execute('SELECT * FROM management_release_drafts WHERE id=?', (ident,)).fetchone()
                if not draft:
                    raise ManagementError(404, 'DRAFT_NOT_FOUND', '待发布版本不存在')
                metadata = json.loads(draft['metadata'])
                sha, size, notes = draft['sha256'], draft['size'], draft['notes']
                if request['sha256'] != sha or request['build'] != str(metadata['version_code']):
                    raise ManagementError(409, 'DRAFT_MISMATCH', '确认信息与待发布包不一致，请刷新后核对')
                current = self._current(c, metadata['platform'])
                if draft['status'] == 'published' and current and current['published'] and current['sha256'] == sha:
                    return {'release': self._response(c, current), 'alreadyPublished': True}
                if draft['status'] != 'draft':
                    raise ManagementError(409, 'DRAFT_NOT_PENDING', '此版本已发布或已丢弃')
                package_file = self._path(draft)
                if file_digest(package_file) != (sha, size):
                    raise ManagementError(409, 'PACKAGE_CHANGED', '待发布包内容已变化，线上版本保持不变，请重新上传')
                validation, _ = self._validation(metadata, current)
                if validation['errors']:
                    code = 'BUILD_DOWNGRADE' if '低于' in validation['errors'][0] else 'PACKAGE_NOT_INSTALLABLE'
                    raise ManagementError(409, code, validation['errors'][0])
                if current and current['published'] and current['sha256'] == sha:
                    relative = 'packages/' + str(current['filename'])
                    if not SAFE_FILE.fullmatch(relative) or file_digest(self.data / relative) != (sha, size):
                        raise ManagementError(409, 'PACKAGE_CHANGED', '当前包文件校验异常，未改动线上版本')
                    c.execute("UPDATE management_release_drafts SET status='published',published_at=?,published_by=?,app_id=? WHERE id=?",
                              (int(time.time() * 1000), actor, current['id'], ident))
                    return {'release': self._response(c, current), 'alreadyPublished': True}
                if validation['sameBuild'] and not request.get('confirmSameBuild'):
                    raise ManagementError(409, 'SAME_BUILD_CONFIRMATION_REQUIRED', '同 Build 修复不会触发自动更新，请明确确认后发布')
                old, _ = self.releases._compact(c, metadata['platform'])
                old_values = dict(old) if old else {}
                app_id = old_values.get('id') or secrets.token_hex(12)
                suffix = '.ipa' if metadata['platform'] == 'ios' else '.apk'
                filename = app_id + '-' + sha + suffix
                target = self._promote(package_file, 'packages/' + filename, promoted)
                if file_digest(target) != (sha, size):
                    raise ManagementError(409, 'PACKAGE_CHANGED', '发布文件校验不一致，当前版本保持不变')
                icon_url = old_values.get('icon_url') or ''
                if draft['icon_filename']:
                    icon_file = self._path(draft, icon=True)
                    if icon_file.is_symlink() or not icon_file.is_file():
                        raise ManagementError(409, 'PACKAGE_CHANGED', '安装包图标文件已变化')
                    icon_name = app_id + '-' + sha + '.png'
                    self._promote(icon_file, 'icons/' + icon_name, promoted)
                    icon_url = '/icons/' + icon_name
                now = int(time.time())
                record = {'id': app_id, 'name': metadata['name'], 'version': metadata['version'], 'package': JINLING_PACKAGE,
                          'description': old_values.get('description') or '', 'notes': notes,
                          'category': old_values.get('category') or '实用工具', 'size': size, 'sha256': sha, 'filename': filename,
                          'published': 1, 'downloads': int(old_values.get('downloads') or 0), 'created': now,
                          'icon_url': icon_url, 'version_code': metadata['version_code'],
                          'parse_warning': metadata.get('parse_warning', ''), 'platform': metadata['platform'],
                          'minimum_os_version': metadata.get('minimum_os_version', ''),
                          'ios_distribution': metadata.get('ios_distribution', ''),
                          'provisioning_expires_at': metadata.get('provisioning_expires_at', ''),
                          'ios_signed': int(bool(metadata.get('ios_signed'))), 'unlisted': int(old_values.get('unlisted', 1))}
                if old:
                    self._event(c, old['id'], 'superseded', actor, dict(old), old['sha256'], old['size'], old['notes'] or '',
                                '同平台旧版本已被新发布替换，旧文件将清理', app_id)
                    c.execute('UPDATE apps SET ' + ','.join(key + '=?' for key in record if key != 'id') + ' WHERE id=?',
                              [value for key, value in record.items() if key != 'id'] + [app_id])
                    self.releases._queue(c, self.releases._files(old) - self.releases._files(record))
                else:
                    c.execute('INSERT INTO apps(' + ','.join(record) + ') VALUES(' + ','.join('?' for _ in record) + ')', list(record.values()))
                c.execute('INSERT INTO product_variants VALUES(?,?,?) ON CONFLICT(slug,platform) DO UPDATE SET app_id=excluded.app_id',
                          (JINLING_SLUG, metadata['platform'], app_id))
                c.execute("UPDATE management_release_drafts SET status='published',published_at=?,published_by=?,app_id=? WHERE id=?",
                          (int(time.time() * 1000), actor, app_id, ident))
                self._event(c, ident, 'published', actor, metadata, sha, size, notes, '管理员确认版本及 SHA256 后发布', app_id, validation['sameBuild'])
                result = {'release': self._response(c, record)}
        except Exception as error:
            with self.lock, self.connect() as c:
                c.execute('BEGIN IMMEDIATE')
                for relative in promoted:
                    if not self.releases._referenced(c, relative):
                        (self.data / relative).unlink(missing_ok=True)
            try:
                with self.lock, self.connect() as c:
                    if draft and draft['status'] == 'draft' and metadata:
                        self._event(c, ident, 'publish_rejected', actor, metadata, sha, size, notes,
                                    str(error) if isinstance(error, ManagementError) else '发布失败，线上版本和待发布包保持不变')
            except Exception:
                pass
            raise
        return result

    def discard(self, ident, actor):
        with self.lock, self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            draft = c.execute('SELECT * FROM management_release_drafts WHERE id=?', (ident,)).fetchone()
            if not draft:
                raise ManagementError(404, 'DRAFT_NOT_FOUND', '待发布版本不存在')
            if draft['status'] == 'published':
                raise ManagementError(409, 'DRAFT_NOT_PENDING', '已发布版本不能作为待发布包丢弃')
            if draft['status'] == 'draft':
                c.execute("UPDATE management_release_drafts SET status='discarded' WHERE id=?", (ident,))
                self._event(c, ident, 'discarded', actor, json.loads(draft['metadata']), draft['sha256'], draft['size'],
                            draft['notes'], '待发布包已丢弃，线上版本保持不变')
        self.cleanup()
        return {'ok': True}

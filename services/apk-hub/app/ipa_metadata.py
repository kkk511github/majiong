"""Inspect an IPA without extracting or executing any uploaded content.

Provisioning information is descriptive metadata, not signature validation or a
promise that Apple will allow installation on a particular device.
"""
import datetime as dt
import io
import os
import re
import selectors
import stat
import struct
import subprocess
import tempfile
import time
import zipfile
import plistlib
import zlib
from xml.parsers.expat import ExpatError

from PIL import Image


MAX_ARCHIVE_SIZE = 2 * 1024 ** 3
MAX_CENTRAL_DIRECTORY = 32 * 1024 ** 2
MAX_MEMBERS = 50000
MAX_TOTAL_SIZE = 8 * 1024 ** 3
MAX_PLIST_SIZE = 2 * 1024 ** 2
MAX_PROFILE_SIZE = 8 * 1024 ** 2
MAX_RESOURCE_SIZE = 8 * 1024 ** 2
MAX_ICON_TOTAL_SIZE = 32 * 1024 ** 2
MAX_COMPRESSION_RATIO = 200
PROFILE_TIMEOUT = 10


def _safe_path(name, directory=False):
    if not isinstance(name, str) or not name or len(name) > 1024:
        return False
    if '\\' in name or ':' in name or any(ord(c) < 32 for c in name):
        return False
    if directory and name.endswith('/'):
        name = name[:-1]
    return bool(name) and all(part not in ('', '.', '..') for part in name.split('/'))


def _check_directory(path):
    """Bound ZipFile's central-directory allocation before constructing it."""
    size = os.path.getsize(path)
    if size < 22 or size > MAX_ARCHIVE_SIZE:
        raise ValueError('IPA 文件为空、损坏或超过解析大小限制')
    with open(path, 'rb') as source:
        source.seek(max(0, size - 65557))
        tail = source.read(65557)
    end = tail.rfind(b'PK\x05\x06')
    if end < 0 or end + 22 > len(tail):
        raise ValueError('IPA 不是完整的 ZIP 安装包')
    _, disk, directory_disk, disk_entries, entries, length, offset, comment = struct.unpack(
        '<4s4H2IH', tail[end:end + 22])
    if end + 22 + comment != len(tail):
        raise ValueError('IPA ZIP 目录或注释损坏')
    if disk or directory_disk or disk_entries != entries:
        raise ValueError('不支持分卷 IPA 安装包')
    if entries == 65535 or length == 0xffffffff or offset == 0xffffffff:
        raise ValueError('IPA ZIP64 目录超出当前解析范围')
    eocd_offset = size - len(tail) + end
    if entries > MAX_MEMBERS or length > MAX_CENTRAL_DIRECTORY or offset + length != eocd_offset:
        raise ValueError('IPA ZIP 目录过大或损坏')
    # Do not trust the EOCD entry count: ZipFile reads every central entry even
    # if a forged footer advertises only one. Validate the bounded raw directory
    # before it can allocate thousands of ZipInfo objects.
    with open(path, 'rb') as source:
        source.seek(offset)
        directory = source.read(length)
    cursor, actual_entries = 0, 0
    while cursor < length:
        if cursor + 46 > length or directory[cursor:cursor + 4] != b'PK\x01\x02':
            raise ValueError('IPA ZIP 中央目录损坏')
        name_length, extra_length, comment_length = struct.unpack_from('<3H', directory, cursor + 28)
        cursor += 46 + name_length + extra_length + comment_length
        actual_entries += 1
        if actual_entries > MAX_MEMBERS or cursor > length:
            raise ValueError('IPA ZIP 中央目录超过解析限制或损坏')
    if actual_entries != entries:
        raise ValueError('IPA ZIP 中央目录文件数不一致')


def _members(archive):
    result = {}
    total = 0
    entries = archive.infolist()
    if len(entries) > MAX_MEMBERS:
        raise ValueError('IPA 文件数量超过解析限制')
    for member in entries:
        name = member.orig_filename
        if not _safe_path(name, member.is_dir()):
            raise ValueError('IPA 包含不安全的文件路径')
        if name in result:
            raise ValueError('IPA 包含重复文件，无法确定真实内容')
        if member.flag_bits & 1:
            raise ValueError('不支持加密的 IPA ZIP 安装包')
        if member.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise ValueError('IPA 使用了不支持的 ZIP 压缩格式')
        total += member.file_size
        if total > MAX_TOTAL_SIZE:
            raise ValueError('IPA 声明的解压大小超过解析限制')
        result[name] = member
    return result


def _read(archive, member, limit):
    if member.is_dir() or stat.S_ISLNK(member.external_attr >> 16):
        raise ValueError('IPA 关键文件不能是目录或符号链接')
    if member.file_size > limit or member.file_size > max(1, member.compress_size) * MAX_COMPRESSION_RATIO:
        raise ValueError('IPA 元数据大小或压缩比例超过解析限制')
    try:
        with archive.open(member) as source:
            data = source.read(limit + 1)
    except (zipfile.BadZipFile, zlib.error, RuntimeError, EOFError) as exc:
        raise ValueError('IPA 元数据内容损坏') from exc
    if len(data) > limit or len(data) != member.file_size:
        raise ValueError('IPA 元数据大小无效')
    return data


def _plist(data):
    try:
        value = plistlib.loads(data)
    except (ValueError, TypeError, OverflowError, RecursionError, ExpatError, plistlib.InvalidFileException) as exc:
        raise ValueError('IPA 属性列表格式无效') from exc
    if not isinstance(value, dict):
        raise ValueError('IPA 属性列表必须是字典')
    return value


def _decode_profile(data):
    """Extract bounded CMS content; deliberately do not certify its signature."""
    with tempfile.TemporaryFile() as source:
        source.write(data)
        source.seek(0)
        try:
            process = subprocess.Popen(
                ['openssl', 'cms', '-verify', '-inform', 'DER', '-noverify', '-nosigs', '-binary'],
                stdin=source, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        except OSError as exc:
            raise ValueError('服务器无法读取签名描述文件') from exc
        output = bytearray()
        deadline = time.monotonic() + PROFILE_TIMEOUT
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise ValueError('签名描述文件解析超时')
                    if not selector.select(remaining):
                        raise ValueError('签名描述文件解析超时')
                    chunk = os.read(process.stdout.fileno(), 65536)
                    if not chunk:
                        selector.unregister(process.stdout)
                        break
                    output.extend(chunk)
                    if len(output) > MAX_PLIST_SIZE:
                        raise ValueError('签名描述文件内容过大')
            remaining = deadline - time.monotonic()
            if remaining <= 0 or process.wait(timeout=remaining) != 0:
                raise ValueError('签名描述文件无法读取')
            return _plist(bytes(output))
        except subprocess.TimeoutExpired as exc:
            raise ValueError('签名描述文件解析超时') from exc
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()


def _provisioning(archive, members, app, package, warnings):
    profile_member = members.get(app + 'embedded.mobileprovision')
    resources_member = members.get(app + '_CodeSignature/CodeResources')
    distribution, expires, profile_valid, resources_valid = 'unknown', '', False, False
    if resources_member:
        try:
            resources = _plist(_read(archive, resources_member, MAX_RESOURCE_SIZE))
            resources_valid = any(isinstance(resources.get(key), dict) for key in ('files', 'files2'))
        except (ValueError, OSError, zipfile.BadZipFile):
            pass
    if not profile_member:
        distribution = 'unknown' if resources_member else 'unsigned'
        warnings.append('未发现内嵌描述文件，无法确认分发方式及设备安装资格。')
    else:
        try:
            profile = _decode_profile(_read(archive, profile_member, MAX_PROFILE_SIZE))
            entitlements = profile.get('Entitlements')
            expiry = profile.get('ExpirationDate')
            teams = profile.get('TeamIdentifier')
            if (not isinstance(entitlements, dict) or not isinstance(expiry, dt.datetime)
                    or not isinstance(profile.get('UUID'), str) or not profile['UUID']
                    or not isinstance(teams, list) or not teams
                    or any(not isinstance(team, str) or not team for team in teams)):
                raise ValueError('签名描述文件缺少必要字段')
            app_identifier = entitlements.get('application-identifier') or entitlements.get('com.apple.application-identifier')
            if not isinstance(app_identifier, str) or '.' not in app_identifier:
                raise ValueError('签名描述文件缺少应用标识')
            pattern = app_identifier.split('.', 1)[1]
            matches = pattern == package or (pattern.endswith('*') and '*' not in pattern[:-1]
                                              and package.startswith(pattern[:-1]))
            if not matches:
                # A readable profile still describes distribution and expiry.
                # Keep this warning separate from website install eligibility;
                # only iOS can decide whether to accept the uploaded signature.
                warnings.append('签名描述文件与应用标识不匹配，安装时由 iOS 校验。')
            expiry = expiry.replace(tzinfo=dt.timezone.utc) if expiry.tzinfo is None else expiry.astimezone(dt.timezone.utc)
            expires = expiry.isoformat(timespec='seconds').replace('+00:00', 'Z')
            if expiry <= dt.datetime.now(dt.timezone.utc):
                warnings.append('描述文件已过期，需重新签名后安装。')
            devices = profile.get('ProvisionedDevices')
            debug = entitlements.get('get-task-allow')
            if profile.get('ProvisionsAllDevices') is True:
                distribution = 'enterprise'
            elif isinstance(devices, list) and devices and all(isinstance(device, str) for device in devices):
                distribution = 'development' if debug is True else 'ad_hoc'
            elif devices is None and debug is False:
                distribution = 'app_store'
            profile_valid = True
        except (ValueError, OSError, zipfile.BadZipFile) as exc:
            warnings.append(str(exc) + '，分发方式暂时未知。')
    if not resources_valid:
        warnings.append('未发现可识别的代码签名资源，尚不能确认安装包已签名。')
    return distribution, expires, profile_valid and resources_valid


def _icon_references(info):
    references = []
    for key in ('CFBundleIcons', 'CFBundleIcons~ipad'):
        icons = info.get(key)
        primary = icons.get('CFBundlePrimaryIcon') if isinstance(icons, dict) else None
        files = primary.get('CFBundleIconFiles') if isinstance(primary, dict) else None
        if isinstance(files, list):
            references.extend(files[:64])
    files = info.get('CFBundleIconFiles')
    if isinstance(files, list):
        references.extend(files[:64])
    if isinstance(info.get('CFBundleIconFile'), str):
        references.append(info['CFBundleIconFile'])
    return [value for value in references[:192] if isinstance(value, str) and _safe_path(value)]


def _icon(archive, members, app, info, icon_output, warnings):
    candidates = set()
    for reference in _icon_references(info):
        if reference.lower().endswith('.png'):
            reference = reference[:-4]
        elif '.' in reference.rsplit('/', 1)[-1] and not re.search(r'\d\.\d', reference):
            continue
        expression = re.compile(re.escape(app + reference) + r'(?:@[123]x)?(?:~(?:ipad|iphone))?\.png$', re.I)
        candidates.update(name for name in members if expression.fullmatch(name))
    best, best_area, compressed, read_size = None, 0, False, 0
    for name in sorted(candidates, key=lambda value: ('@3x' in value, '@2x' in value, value), reverse=True)[:16]:
        try:
            read_size += members[name].file_size
            if read_size > MAX_ICON_TOTAL_SIZE:
                break
            data = _read(archive, members[name], MAX_RESOURCE_SIZE)
            if data.startswith(b'\x89PNG\r\n\x1a\n') and b'CgBI' in data[:64]:
                compressed = True
                continue
            with Image.open(io.BytesIO(data)) as image:
                area = image.width * image.height
                if image.format != 'PNG' or not 0 < area <= 4096 * 4096 or image.width > 4096 or image.height > 4096:
                    continue
                if area > best_area:
                    converted = image.convert('RGBA')
                    converted.thumbnail((256, 256))
                    best, best_area = converted, area
        except (KeyError, OSError, ValueError, zipfile.BadZipFile, Image.DecompressionBombError):
            continue
    if best is not None:
        try:
            best.save(icon_output, 'PNG')
            return True
        except OSError:
            pass
    warnings.append('应用图标采用 iOS 压缩 PNG，暂用名称图标。' if compressed else
                    '未找到图标声明对应的可读取 PNG，暂用名称图标（Assets.car 图标暂不支持）。')
    return False


def parse_ipa(path, icon_output):
    """Return shared app metadata plus advisory iOS provisioning information."""
    warnings = []
    try:
        _check_directory(path)
        with zipfile.ZipFile(path) as archive:
            members = _members(archive)
            main = [name for name in members if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist', name)]
            if len(main) != 1:
                raise ValueError('IPA 必须包含唯一的 Payload 主应用及 Info.plist')
            app = main[0][:-len('Info.plist')]
            info = _plist(_read(archive, members[main[0]], MAX_PLIST_SIZE))
            if info.get('CFBundlePackageType') != 'APPL':
                raise ValueError('IPA 主应用的 CFBundlePackageType 必须是 APPL')
            package = info.get('CFBundleIdentifier')
            if not isinstance(package, str) or len(package) > 255 or not re.fullmatch(r'[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', package):
                raise ValueError('IPA 缺少有效的 Bundle ID')
            executable = info.get('CFBundleExecutable')
            if not isinstance(executable, str) or not _safe_path(executable) or '/' in executable:
                raise ValueError('IPA 缺少有效的主程序名称')
            executable_member = members.get(app + executable)
            if (executable_member is None or executable_member.is_dir() or not executable_member.file_size
                    or stat.S_ISLNK(executable_member.external_attr >> 16)):
                raise ValueError('IPA 缺少主程序文件')
            platforms = info.get('CFBundleSupportedPlatforms')
            if platforms is not None and (not isinstance(platforms, list) or 'iPhoneOS' not in platforms):
                raise ValueError('请上传面向 iOS 真机的 IPA 安装包')
            versions = []
            for field in ('CFBundleShortVersionString', 'CFBundleVersion'):
                value = info.get(field)
                if value is None and field == 'CFBundleShortVersionString':
                    versions.append('')
                    continue
                if not isinstance(value, str) or not re.fullmatch(r'[0-9][0-9A-Za-z.+_-]{0,63}', value):
                    raise ValueError('IPA 缺少有效的版本信息')
                versions.append(value)
            name = info.get('CFBundleDisplayName') or info.get('CFBundleName') or package
            if (not isinstance(name, str) or not name.strip() or len(name) > 256
                    or any(ord(c) < 32 or 0xd800 <= ord(c) <= 0xdfff or ord(c) in (0xfffe, 0xffff) for c in name)):
                name = package
            minimum = info.get('MinimumOSVersion', '')
            if not isinstance(minimum, str) or (minimum and not re.fullmatch(r'\d+(?:\.\d+){0,2}', minimum)):
                minimum = ''
                warnings.append('最低 iOS 版本字段无效，暂不展示。')
            distribution, expiry, signed = _provisioning(archive, members, app, package, warnings)
            icon_found = _icon(archive, members, app, info, icon_output, warnings)
            return {'name': name.strip(), 'package': package, 'version': versions[0] or versions[1],
                    'version_code': versions[1], 'icon_found': icon_found,
                    'parse_warning': ' '.join(warnings), 'platform': 'ios',
                    'minimum_os_version': minimum, 'ios_distribution': distribution,
                    'provisioning_expires_at': expiry, 'ios_signed': signed}
    except (zipfile.BadZipFile, NotImplementedError, RuntimeError, EOFError, struct.error, UnicodeError) as exc:
        raise ValueError('IPA ZIP 安装包损坏或格式不受支持') from exc

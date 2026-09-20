"""Bounded structural/CRC checks before invoking the existing native parsers."""
import re
import stat
import zipfile
import zlib

from ipa_metadata import _check_directory, _members, MAX_COMPRESSION_RATIO


def validate_archive(path, platform):
    try:
        _check_directory(path)
        with zipfile.ZipFile(path) as archive:
            members = _members(archive)
            if platform == 'android' and 'AndroidManifest.xml' not in members:
                raise ValueError('不是完整的 Android APK 安装包')
            if platform == 'ios' and len([name for name in members if re.fullmatch(r'Payload/[^/]+\.app/Info\.plist', name)]) != 1:
                raise ValueError('不是完整的 iOS IPA 安装包')
            for member in members.values():
                if stat.S_ISLNK(member.external_attr >> 16):
                    raise ValueError('安装包包含不安全的符号链接')
                if member.file_size > max(1, member.compress_size) * MAX_COMPRESSION_RATIO:
                    raise ValueError('安装包压缩比例超过解析限制')
            if archive.testzip() is not None:
                raise ValueError('安装包内容校验失败，文件已损坏')
    except (zipfile.BadZipFile, zlib.error, RuntimeError, EOFError, NotImplementedError) as error:
        raise ValueError('安装包 ZIP 内容损坏或格式不受支持') from error

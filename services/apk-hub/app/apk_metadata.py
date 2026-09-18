"""Read Android resources without executing or extracting the APK."""
import io
import re
import subprocess
import zipfile
from PIL import Image

def parse_apk(path, icon_output):
    try:
        result = subprocess.run(['aapt', 'dump', 'badging', str(path)], capture_output=True,
                                timeout=30, encoding='utf-8', errors='replace')
    except subprocess.TimeoutExpired:
        raise ValueError('安装包解析超时，请检查文件')
    if result.returncode:
        raise ValueError('无法解析 APK 的 AndroidManifest，请使用完整的 APK 安装包')
    text = result.stdout
    package_line = next((line for line in text.splitlines() if line.startswith('package:')), '')
    attrs = dict(re.findall(r"([A-Za-z]+)='([^']*)'", package_line))
    package = attrs.get('name', '')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+', package):
        raise ValueError('安装包缺少有效包名')
    labels = dict(re.findall(r"^application-label([^:]*):'(.*)'$", text, re.M))
    name = labels.get('-zh-CN') or labels.get('-zh') or labels.get('') or package
    version = attrs.get('versionName') or attrs.get('versionCode')
    if not version:
        raise ValueError('安装包缺少版本信息')
    candidates = [(int(density), p) for density, p in re.findall(r"^application-icon-(\d+):'([^']+)'", text, re.M)]
    direct = re.search(r"^application:.*?icon='([^']+)'", text, re.M)
    if direct:
        candidates.append((0, direct.group(1)))
    if any(p.endswith('.xml') for _, p in candidates):
        # Obfuscated APKs can map the same launcher resource to XML on newer
        # Android versions and PNG on older versions. Resolve by resource ID.
        try:
            resources = subprocess.run(['aapt', 'dump', '--values', 'resources', str(path)],
                                       capture_output=True, timeout=30, encoding='utf-8', errors='replace')
            variants = re.findall(r'resource (0x[0-9a-fA-F]+) [^\n]+\n\s+\(string(?:8|16)\) "([^"]+)"', resources.stdout)
            paths = {p for _, p in candidates}
            resource_ids = {rid for rid, p in variants if p in paths}
            for index, (rid, p) in enumerate(variants):
                if rid in resource_ids and p.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')):
                    candidates.append((100000 + index, p))
        except subprocess.TimeoutExpired:
            pass
    icon_found = False
    with zipfile.ZipFile(path) as archive:
        # Use only actual icon resource names, never unrelated APK artwork.
        stems = {p.rsplit('/', 1)[-1].rsplit('.', 1)[0] for _, p in candidates}
        for member in archive.infolist():
            stem = member.filename.rsplit('/', 1)[-1].rsplit('.', 1)[0]
            if stem in stems and member.filename.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')):
                candidates.append((1, member.filename))
        for _, member_name in sorted(set(candidates), reverse=True):
            if not member_name.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')):
                continue
            try:
                member = archive.getinfo(member_name)
                if member.file_size > 8 * 1024 * 1024:
                    continue
                with Image.open(io.BytesIO(archive.read(member))) as image:
                    if image.width * image.height > 4096 * 4096:
                        continue
                    image = image.convert('RGBA')
                    image.thumbnail((256, 256))
                    image.save(icon_output, 'PNG')
                    icon_found = True
                    break
            except (KeyError, OSError, ValueError, Image.DecompressionBombError):
                continue
    return {'name': name, 'package': package, 'version': version,
            'version_code': attrs.get('versionCode', ''), 'icon_found': icon_found,
            'parse_warning': '' if icon_found else '安装包未提供可读取的位图图标，暂用应用名称图标（部分自适应矢量图标不支持）。'}

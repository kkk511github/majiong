import os, json, sqlite3, secrets, hashlib, hmac, time, cgi, zipfile, plistlib, re
from datetime import datetime, timezone
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, quote
from apk_metadata import parse_apk
from ipa_metadata import parse_ipa

ROOT = Path(__file__).parent
DATA = Path(os.environ.get('DATA_DIR', '/var/lib/apk-hub'))
DATA.mkdir(parents=True, exist_ok=True)
(DATA / 'packages').mkdir(exist_ok=True)
(DATA / 'icons').mkdir(exist_ok=True)
MAX = 500 * 1024 * 1024

def db():
    c = sqlite3.connect(DATA / 'hub.db', timeout=30)
    c.row_factory = sqlite3.Row
    return c

with db() as c:
    c.executescript('''CREATE TABLE IF NOT EXISTS apps(id TEXT PRIMARY KEY,name TEXT,version TEXT,package TEXT,description TEXT,notes TEXT,category TEXT,size INTEGER,sha256 TEXT,filename TEXT,published INTEGER,downloads INTEGER DEFAULT 0,created INTEGER);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,csrf TEXT,expires INTEGER);''')
    columns = {r[1] for r in c.execute('PRAGMA table_info(apps)')}
    for column in ['icon_url', 'version_code', 'parse_warning']:
        if column not in columns:
            c.execute('ALTER TABLE apps ADD COLUMN '+column+" TEXT DEFAULT ''")
    for column, definition in {
        'platform': "TEXT NOT NULL DEFAULT 'android'",
        'minimum_os_version': "TEXT DEFAULT ''",
        'ios_distribution': "TEXT DEFAULT ''",
        'provisioning_expires_at': "TEXT DEFAULT ''",
        'ios_signed': 'INTEGER NOT NULL DEFAULT 0',
        'unlisted': 'INTEGER NOT NULL DEFAULT 0',
    }.items():
        if column not in columns:
            c.execute('ALTER TABLE apps ADD COLUMN '+column+' '+definition)

ATTEMPTS = {}


def public_base_url():
    """Use an explicitly configured HTTPS origin, never the request Host."""
    value = os.environ.get('PUBLIC_BASE_URL', '').strip().rstrip('/')
    try:
        parsed = urlparse(value)
        valid = (parsed.scheme == 'https' and parsed.hostname and
                 not parsed.username and not parsed.password and
                 not parsed.path and not parsed.query and not parsed.fragment and
                 not any(c.isspace() for c in value) and parsed.port != 0)
    except ValueError:
        valid = False
    return value if valid else ''


def ios_install_status(app):
    distribution = app.get('ios_distribution', '')
    if distribution == 'app_store':
        return False, '此包用于 App Store 分发，不能通过此页面直接安装。请上传适用的设备分发包。'
    if not app.get('ios_signed') or distribution not in ('enterprise', 'ad_hoc', 'development'):
        return False, '未能确认此 IPA 的设备分发签名信息，暂不能安装。请上传已签名且适配设备的企业、Ad Hoc 或开发分发包。'
    try:
        expires = datetime.fromisoformat(app.get('provisioning_expires_at', '').replace('Z', '+00:00'))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return False, '未能读取签名描述文件有效期，暂不能安装。请检查签名后重新上传。'
    if expires <= datetime.now(timezone.utc):
        return False, '此 IPA 的签名描述文件已过期，暂不能安装。请重新签名后上传。'
    if not public_base_url():
        return False, '苹果网页安装入口尚未配置完成，请联系管理员。'
    notes = {
        'enterprise': '请在 Safari 中打开，安装后按系统提示信任企业开发者；仍需系统验证签名有效性。',
        'ad_hoc': '请在 Safari 中打开；仅限签名中已登记的设备安装，仍需系统验证签名有效性。',
        'development': '请在 Safari 中打开；仅限已登记的开发设备，可能需要启用开发者模式。',
    }
    note = notes[distribution]
    if '签名描述文件与应用标识不匹配' in str(app.get('parse_warning') or ''):
        note = '应用标识与签名描述文件不匹配，可点击尝试安装；是否成功由 iOS 校验决定。' + note
    return True, note


def app_response(row):
    app = dict(row)
    app['platform'] = app.get('platform') or 'android'
    app['unlisted'] = bool(app.get('unlisted'))
    base = public_base_url() if app.get('published') else ''
    app['share_url'] = base+'/app/'+app['id'] if base else ''
    extension = '.ipa' if app['platform'] == 'ios' else '.apk'
    app['download_url'] = base+'/download/'+app['id']+extension if base else ''
    app['install_url'] = ''
    app['installation_note'] = ''
    if app['platform'] == 'ios':
        ready, note = ios_install_status(app)
        app['installation_note'] = note
        if app.get('published') and ready:
            manifest = public_base_url()+'/manifest/'+app['id']+'.plist'
            app['install_url'] = 'itms-services://?action=download-manifest&url='+quote(manifest, safe='')
    return app


def package_path(row):
    platform = row['platform'] or 'android'
    suffix = '.ipa' if platform == 'ios' else '.apk'
    if row['filename'] != row['id'] + suffix:
        return None
    path = DATA/'packages'/row['filename']
    return path if path.is_file() else None


def manifest_bytes(app):
    base = public_base_url()
    assets = [{'kind': 'software-package', 'url': base+'/download/'+app['id']+'.ipa'}]
    if app.get('icon_url') and re.fullmatch(r'/icons/[a-f0-9]{24}\.png', app['icon_url']):
        assets.append({'kind': 'display-image', 'needs-shine': False, 'url': base+app['icon_url']})
    manifest = {'items': [{'assets': assets, 'metadata': {
        'bundle-identifier': app['package'], 'bundle-version': app['version_code'],
        'kind': 'software', 'title': app['name'],
    }}]}
    return plistlib.dumps(manifest, fmt=plistlib.FMT_XML, sort_keys=False)

class Handler(BaseHTTPRequestHandler):
    def send(self, code, body, mime='application/json', extra=None):
        if isinstance(body, (dict,list)): body=json.dumps(body,ensure_ascii=False).encode()
        if isinstance(body,str): body=body.encode()
        self.send_response(code)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        for k,v in (extra or {}).items(): self.send_header(k,v)
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(body)

    def session(self):
        cookies=dict(x.strip().split('=',1) for x in self.headers.get('Cookie','').split(';') if '=' in x)
        with db() as c: return c.execute('SELECT * FROM sessions WHERE token=? AND expires>?',(cookies.get('apk_session',''),time.time())).fetchone()

    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/health': return self.send(200,{'ok':True})
        if path=='/api/session':
            s=self.session(); return self.send(200,{'authenticated':bool(s),'csrf':s['csrf'] if s else None})
        if path in ['/api/apps','/api/admin/apps']:
            if path=='/api/admin/apps' and not self.session(): return self.send(401,{'error':'请先登录管理后台'})
            with db() as c:
                rows=c.execute('SELECT * FROM apps '+('WHERE published=1 AND unlisted=0 ' if path=='/api/apps' else '')+'ORDER BY created DESC').fetchall()
            return self.send(200,[app_response(r) for r in rows])
        if path.startswith('/app/') or path.startswith('/api/apps/'):
            match = re.fullmatch(r'/(app|api/apps)/([a-f0-9]{24})', path)
            if not match: return self.send(404, {'error': '分发链接不存在或已停用'})
            with db() as c:
                row = c.execute('SELECT * FROM apps WHERE id=? AND published=1', (match.group(2),)).fetchone()
            if not row or not package_path(row):
                return self.send(404, {'error': '分发链接不存在或已停用'})
            headers = {'X-Robots-Tag': 'noindex, nofollow'}
            if match.group(1) == 'api/apps':
                return self.send(200, app_response(row), extra=headers)
            return self.send(200, (ROOT/'static/index.html').read_bytes(), 'text/html; charset=utf-8', extra=headers)
        if path.startswith('/manifest/'):
            match = re.fullmatch(r'/manifest/([a-f0-9]{24})\.plist', path)
            if not match: return self.send(404, {'error': '安装清单不存在'})
            with db() as c:
                row = c.execute('SELECT * FROM apps WHERE id=? AND published=1 AND platform=?', (match.group(1), 'ios')).fetchone()
            if not row or not package_path(row): return self.send(404, {'error': '安装包不存在或已下架'})
            app = dict(row)
            ready, note = ios_install_status(app)
            if not ready: return self.send(409, {'error': note})
            return self.send(200, manifest_bytes(app), 'text/xml; charset=utf-8')
        if path.startswith('/icons/') and path.endswith('.png'):
            ident = path.split('/')[-1][:-4]
            with db() as c:
                row = c.execute('SELECT published FROM apps WHERE id=?', (ident,)).fetchone()
            if not row or (not row['published'] and not self.session()):
                return self.send(404, {'error':'图标不存在'})
            image = DATA/'icons'/(ident+'.png')
            if not image.is_file(): return self.send(404, {'error':'图标不存在'})
            return self.send(200, image.read_bytes(), 'image/png')
        if path.startswith('/download/'):
            match=re.fullmatch(r'/download/([a-f0-9]{24})(?:\.(apk|ipa))?', path)
            if not match: return self.send(404, {'error': '安装包不存在'})
            with db() as c:
                r=c.execute('SELECT * FROM apps WHERE id=? AND published=1',(match.group(1),)).fetchone()
                if not r: return self.send(404,{'error':'安装包不存在或已下架'})
                expected_extension='ipa' if r['platform']=='ios' else 'apk'
                if match.group(2) and match.group(2)!=expected_extension: return self.send(404, {'error':'安装包不存在'})
                p=package_path(r)
                if not p: return self.send(404,{'error':'文件不存在'})
            total=p.stat().st_size
            start, end, code = 0, total-1, 200
            requested=self.headers.get('Range') if self.command != 'HEAD' else None
            if requested:
                match=re.fullmatch(r'bytes=(\d*)-(\d*)', requested.strip())
                try:
                    if not match or not any(match.groups()): raise ValueError('range')
                    first,last=match.groups()
                    if first:
                        start=int(first); end=min(int(last),total-1) if last else total-1
                    else:
                        if int(last)<=0: raise ValueError('range')
                        start=max(0,total-int(last))
                    if start>=total or start>end: raise ValueError('range')
                except ValueError:
                    return self.send(416, {'error':'下载范围无效'}, extra={'Content-Range':f'bytes */{total}'})
                code=206
            if self.command != 'HEAD':
                with db() as c: c.execute('UPDATE apps SET downloads=downloads+1 WHERE id=?',(r['id'],))
            self.send_response(code)
            is_ios=r['platform']=='ios'
            self.send_header('Content-Type','application/octet-stream' if is_ios else 'application/vnd.android.package-archive')
            self.send_header('Content-Length',str(end-start+1))
            self.send_header('Content-Disposition','attachment; filename="'+r['id']+('.ipa' if is_ios else '.apk')+'"')
            self.send_header('Accept-Ranges','bytes')
            if code==206: self.send_header('Content-Range',f'bytes {start}-{end}/{total}')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Cache-Control','no-store'); self.end_headers()
            if self.command == 'HEAD': return
            with p.open('rb') as f:
                f.seek(start); remaining=end-start+1
                try:
                    while remaining:
                        chunk=f.read(min(1024*1024,remaining))
                        if not chunk: break
                        self.wfile.write(chunk); remaining-=len(chunk)
                except (BrokenPipeError, ConnectionResetError): pass
            return
        if path in ['/','/admin','/admin/']: return self.send(200,(ROOT/'static/index.html').read_bytes(),'text/html; charset=utf-8')
        if path in ['/style.css','/app.js','/upload.js']: return self.send(200,(ROOT/'static'/path[1:]).read_bytes(),'text/css' if path.endswith('css') else 'text/javascript; charset=utf-8')
        self.send(404,{'error':'页面不存在'})

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        try: self.post()
        except (ValueError,KeyError,json.JSONDecodeError): self.send(400,{'error':'提交内容无效，请检查后重试'})
        except Exception as e:
            print(type(e).__name__, flush=True); self.send(500,{'error':'操作失败，请稍后重试'})

    def post(self):
        path=urlparse(self.path).path
        size=int(self.headers.get('Content-Length','0'))
        if size<=0 or size>MAX+65536: return self.send(413,{'error':'文件不能超过 500 MB'})
        if path=='/api/login':
            if size>4096: return self.send(400,{'error':'请求过大'})
            ip=self.headers.get('X-Real-IP',self.client_address[0]); now=time.time()
            attempts=[t for t in ATTEMPTS.get(ip,[]) if t>now-600]
            if len(attempts)>=10: return self.send(429,{'error':'尝试次数过多，请 10 分钟后重试'})
            data=json.loads(self.rfile.read(size)); supplied=data.get('password','')
            expected=os.environ['ADMIN_PASSWORD_HASH']; salt=os.environ['ADMIN_SALT']
            actual=hashlib.pbkdf2_hmac('sha256',supplied.encode(),salt.encode(),200000).hex()
            if not hmac.compare_digest(expected,actual):
                ATTEMPTS[ip]=attempts+[now]; return self.send(401,{'error':'管理密码不正确'})
            token=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(24)
            with db() as c:
                c.execute('DELETE FROM sessions WHERE expires<?',(now,))
                c.execute('INSERT INTO sessions VALUES(?,?,?)',(token,csrf,now+43200))
            return self.send(200,{'csrf':csrf},extra={'Set-Cookie':f'apk_session={token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200'})
        s=self.session()
        if not s: return self.send(401,{'error':'请先登录管理后台'})
        if not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),s['csrf']): return self.send(403,{'error':'页面已过期，请刷新重试'})
        if path=='/api/logout':
            with db() as c: c.execute('DELETE FROM sessions WHERE token=?',(s['token'],))
            return self.send(200,{'ok':True},extra={'Set-Cookie':'apk_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'})
        if path=='/api/upload':
            if not self.headers.get('Content-Type','').startswith('multipart/form-data'): return self.send(400,{'error':'请选择 APK 或 IPA 文件'})
            form=cgi.FieldStorage(fp=self.rfile,headers=self.headers,environ={'REQUEST_METHOD':'POST','CONTENT_TYPE':self.headers['Content-Type'],'CONTENT_LENGTH':str(size)})
            if 'file' not in form: return self.send(400,{'error':'请选择 APK 或 IPA 文件'})
            file=form['file']
            if isinstance(file,list) or not file.filename or not file.filename.lower().endswith(('.apk','.ipa')): return self.send(400,{'error':'仅支持 APK 或 IPA 文件'})
            suffix=Path(file.filename).suffix.lower()
            platform='ios' if suffix=='.ipa' else 'android'
            values={k:str(form.getfirst(k,'')).strip() for k in ['name','version','package','description','notes','category']}
            if any(len(v)>4000 for v in values.values()): return self.send(400,{'error':'文字过长'})
            ident=secrets.token_hex(12); target=DATA/'packages'/(ident+suffix); digest=hashlib.sha256(); total=0
            try:
                with target.open('wb') as out:
                    while chunk:=file.file.read(1024*1024):
                        total+=len(chunk)
                        if total>MAX: raise ValueError('size')
                        out.write(chunk); digest.update(chunk)
                if platform=='android':
                    with zipfile.ZipFile(target) as z:
                        if 'AndroidManifest.xml' not in z.namelist(): raise ValueError('manifest')
            except (ValueError,zipfile.BadZipFile):
                target.unlink(missing_ok=True); return self.send(400,{'error':'不是有效的安装包，或文件超过 500 MB'})
            icon_file = DATA/'icons'/(ident+'.png')
            try:
                metadata = parse_ipa(target, icon_file) if platform=='ios' else parse_apk(target, icon_file)
            except ValueError as error:
                target.unlink(missing_ok=True); icon_file.unlink(missing_ok=True)
                return self.send(400, {'error':str(error)})
            values.update({key: metadata[key] for key in ['name','version','package']})
            icon_url = '/icons/'+ident+'.png' if metadata['icon_found'] else ''
            try:
                with db() as c:
                    c.execute('INSERT INTO apps(id,name,version,package,description,notes,category,size,sha256,filename,published,downloads,created,icon_url,version_code,parse_warning,platform,minimum_os_version,ios_distribution,provisioning_expires_at,ios_signed) VALUES(?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,?,?)',(ident,values['name'],values['version'],values['package'],values['description'],values['notes'],values['category'] or '实用工具',total,digest.hexdigest(),ident+suffix,int(time.time()),icon_url,metadata['version_code'],metadata['parse_warning'],platform,metadata.get('minimum_os_version',''),metadata.get('ios_distribution',''),metadata.get('provisioning_expires_at',''),int(bool(metadata.get('ios_signed')))))
            except Exception:
                target.unlink(missing_ok=True); icon_file.unlink(missing_ok=True); raise
            return self.send(201,app_response({'id':ident,**metadata,'platform':platform,'icon_url':icon_url,'published':0}))
        if path=='/api/delete':
            if size>4096: return self.send(400, {'error':'请求过大'})
            data=json.loads(self.rfile.read(size))
            ident=data.get('id')
            if not isinstance(ident,str) or not re.fullmatch(r'[a-f0-9]{24}',ident):
                return self.send(400, {'error':'应用编号无效'})
            moved=[]
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    row=c.execute('SELECT * FROM apps WHERE id=?',(ident,)).fetchone()
                    if not row: return self.send(404, {'error':'应用不存在或已删除'})
                    if data.get('confirm_name')!=row['name']:
                        return self.send(409, {'error':'应用名称已变化，请刷新后重新确认'})
                    suffix='.ipa' if row['platform']=='ios' else '.apk'
                    if row['filename']!=ident+suffix: raise ValueError('filename')
                    for source in [DATA/'packages'/(ident+suffix),DATA/'icons'/(ident+'.png')]:
                        if source.exists():
                            staged=source.with_name(source.name+'.deleting-'+secrets.token_hex(8))
                            source.rename(staged);moved.append((source,staged))
                    c.execute('DELETE FROM apps WHERE id=?',(ident,))
            except Exception:
                for source,staged in reversed(moved):
                    if staged.exists(): staged.rename(source)
                raise
            for source,staged in moved: staged.unlink(missing_ok=True)
            return self.send(200, {'ok':True})
        if path=='/api/update':
            if size>16384: return self.send(400,{'error':'请求过大'})
            data=json.loads(self.rfile.read(size))
            if 'unlisted' in data and type(data['unlisted']) is not bool:
                return self.send(400, {'error': '请选择有效的展示范围'})
            name=str(data.get('name','')).strip()
            description=str(data.get('description','')).strip()
            notes=str(data.get('notes','')).strip()
            category=str(data.get('category','实用工具'))
            invalid_name=any(ord(ch)<32 or 0xD800<=ord(ch)<=0xDFFF or ord(ch) in (0xFFFE,0xFFFF) for ch in name)
            if not name or invalid_name or len(name)>200 or len(description)>500 or len(notes)>3000 or category not in ['实用工具','效率办公','生活日常','其他']:
                return self.send(400,{'error':'请检查应用名称、分类和文字长度'})
            with db() as c:
                cur=c.execute('UPDATE apps SET name=?,description=?,notes=?,category=?,published=? WHERE id=?',(name,description,notes,category,int(bool(data.get('published'))),str(data.get('id',''))))
                if not cur.rowcount: return self.send(404,{'error':'应用不存在'})
                if 'unlisted' in data:
                    c.execute('UPDATE apps SET unlisted=? WHERE id=?', (int(data['unlisted']), str(data.get('id',''))))
            return self.send(200,{'ok':True})
        if path=='/api/visibility':
            if size>4096: return self.send(400, {'error': '请求过大'})
            data=json.loads(self.rfile.read(size))
            if type(data.get('unlisted')) is not bool:
                return self.send(400, {'error': '请选择有效的展示范围'})
            with db() as c:
                cur=c.execute('UPDATE apps SET unlisted=? WHERE id=?', (int(data['unlisted']), str(data.get('id',''))))
                if not cur.rowcount: return self.send(404, {'error': '应用不存在'})
            return self.send(200, {'ok': True})
        if path=='/api/publish':
            data=json.loads(self.rfile.read(size))
            with db() as c:
                cur=c.execute('UPDATE apps SET published=? WHERE id=?',(int(bool(data['published'])),str(data['id'])))
                if not cur.rowcount: return self.send(404,{'error':'应用不存在'})
            return self.send(200,{'ok':True})
        self.send(404,{'error':'接口不存在'})

if __name__=='__main__': ThreadingHTTPServer((os.environ.get('LISTEN_HOST', '127.0.0.1'),8091),Handler).serve_forever()

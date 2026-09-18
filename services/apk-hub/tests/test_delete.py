import os,tempfile,sys,threading,json,http.client,sqlite3,time,secrets
from pathlib import Path
with tempfile.TemporaryDirectory() as tmp:
    os.environ['DATA_DIR']=tmp
    sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'app'))
    import server
    token=secrets.token_hex(24);csrf=secrets.token_hex(24)
    with server.db() as c:c.execute('INSERT INTO sessions VALUES(?,?,?)',(token,csrf,time.time()+60))
    httpd=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
    threading.Thread(target=httpd.serve_forever,daemon=True).start()
    def request(path,payload,auth=True,valid_csrf=True):
        conn=http.client.HTTPConnection('127.0.0.1',httpd.server_port)
        headers={'Content-Type':'application/json'}
        if auth:headers['Cookie']='apk_session='+token
        if valid_csrf:headers['X-CSRF-Token']=csrf
        conn.request('POST',path,json.dumps(payload),headers);r=conn.getresponse();r.read();conn.close();return r.status
    for platform,suffix in [('android','.apk'),('ios','.ipa')]:
        ident=secrets.token_hex(12)
        package=Path(tmp)/'packages'/(ident+suffix);package.write_bytes(b'test fixture')
        icon=Path(tmp)/'icons'/(ident+'.png');icon.write_bytes(b'icon fixture')
        with server.db() as c:c.execute('INSERT INTO apps(id,name,platform,filename,published) VALUES(?,?,?,?,1)',(ident,'测试应用',platform,ident+suffix))
        payload={'id':ident,'confirm_name':'测试应用'}
        assert request('/api/delete',payload,False)==401
        assert request('/api/delete',payload,True,False)==403
        assert request('/api/delete',{'id':ident,'confirm_name':'错误'})==409
        assert package.exists() and icon.exists()
        assert request('/api/delete',payload)==200
        assert not package.exists() and not icon.exists()
        with server.db() as c:assert not c.execute('SELECT * FROM apps WHERE id=?',(ident,)).fetchone()
        assert request('/api/delete',payload)==404
    assert request('/api/delete',{'id':'../bad','confirm_name':'x'})==400
    httpd.shutdown()
print('PASS: Android/iOS removal, files, auth, CSRF, name confirmation, repeat and invalid IDs')

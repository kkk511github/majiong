import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dirs:string[]=[];afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'mahjong-renew-test-'));dirs.push(dir);const bin=join(dir,'bin');mkdirSync(bin);
 writeFileSync(join(dir,'.env'),'MAHJONG_DOMAIN=212.189.31.46\n');writeFileSync(join(dir,'served'),'A'.repeat(64));
 function stub(name:string,body:string){writeFileSync(join(bin,name),'#!/bin/bash\nset -eu\n'+body,{mode:0o755});}
 stub('flock','exit "${TEST_LOCKED:-0}"\n');
 stub('timeout','shift; exec "$@"\n');
 stub('openssl',`if [[ "$1" == s_client ]]; then
 test "\u0024{TEST_PROBE_FAIL:-0}" != 1 || exit 1
 cat "$MAHJONG_INSTANCE/served"; exit 0
fi
if [[ "$*" == *-checkend* ]]; then exit "\u0024{TEST_EXPIRED:-0}"; fi
if [[ "$*" == *-in* ]]; then printf 'sha256 Fingerprint=%s\\n' "$TEST_DISK"; else read -r value; printf 'sha256 Fingerprint=%s\\n' "$value"; fi\n`);
 stub('docker',`printf '%s\\n' "$*" >> "$MAHJONG_INSTANCE/actions"
if [[ "$1" == run ]]; then exit "\u0024{TEST_RENEW_FAIL:-0}"; fi
if [[ "\u0024{TEST_RELOAD_FAIL:-0}" == 1 ]]; then exit 1; fi
if [[ "\u0024{TEST_STALE_AFTER_RELOAD:-0}" != 1 ]]; then printf '%s\\n' "$TEST_DISK" > "$MAHJONG_INSTANCE/served"; fi\n`);
 function run(extra:Record<string,string>={},check=false){return spawnSync('bash',[resolve('deploy/renew-ip-certificate.sh'),...(check?['--check-only']:[])],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,MAHJONG_INSTANCE:dir,TEST_DISK:'A'.repeat(64),...extra}});}
 const actions=()=>{try{return readFileSync(join(dir,'actions'),'utf8');}catch{return '';}};
 return{run,actions,dir};
}
it('unchanged certificates renew-check but never reload the gateway; key reuse is retained',()=>{
 const f=fixture(),r=f.run();expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('skipped reload');expect(f.actions()).toContain('--reuse-key');expect(f.actions()).not.toContain('caddy reload');
});
it('actually changed certificates reload once and verify the served certificate',()=>{
 const f=fixture();expect(f.run({TEST_DISK:'B'.repeat(64)}).status).toBe(0);expect(f.run({TEST_DISK:'B'.repeat(64)}).status).toBe(0);expect(f.actions().match(/caddy reload/g)).toHaveLength(1);
});
it('failed reloads are retried later, never falsely marked complete',()=>{
 const f=fixture();expect(f.run({TEST_DISK:'B'.repeat(64),TEST_RELOAD_FAIL:'1'}).status).not.toBe(0);expect(f.run({TEST_DISK:'B'.repeat(64)}).status).toBe(0);expect(f.actions().match(/caddy reload/g)).toHaveLength(2);
});
it.each<Record<string,string>>([{TEST_RENEW_FAIL:'1'},{TEST_PROBE_FAIL:'1'},{TEST_EXPIRED:'1'}])('failure does not blindly reload %o',values=>{
 const f=fixture();expect(f.run(values).status).not.toBe(0);expect(f.actions()).not.toContain('caddy reload');
});
it('read-only check does not renew or reload, including when a change is detected',()=>{
 const f=fixture();expect(f.run({},true).status).toBe(0);expect(f.run({TEST_DISK:'B'.repeat(64)},true).stdout).toContain('differs');expect(f.actions()).toBe('');
});
it('a successful reload command is not enough if the gateway still serves the old certificate',()=>{
 const f=fixture();expect(f.run({TEST_DISK:'B'.repeat(64),TEST_STALE_AFTER_RELOAD:'1'}).status).not.toBe(0);
});

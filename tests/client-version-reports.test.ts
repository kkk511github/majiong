import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createClientVersionReports} from '../server/client-version-reports';
it('keeps one latest authenticated report, accepts downgrades and clears unknown versions',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE accounts(id TEXT PRIMARY KEY);INSERT INTO accounts VALUES('one')");
 const reports=createClientVersionReports(db),read=()=>db.prepare('SELECT * FROM client_version_reports').get();
 reports.record('one','0.8.0',100);reports.record('one','0.8.0',200);
 expect(db.prepare('SELECT count(*) AS n FROM client_version_reports').get()!.n).toBe(1);
 expect(read()).toMatchObject({version:'0.8.0',major:0,minor:8,patch:0,reported_at:200});
 reports.record('one','0.7.100',300);reports.record('one','9.0.0',250);
 expect(read()).toMatchObject({version:'0.7.100',reported_at:300});
 for(const input of [undefined,'bad',{},'0.08.0','9'.repeat(10000)]){reports.record('one',input,400);expect(read()).toMatchObject({version:null,major:null,reported_at:400});}
 expect(createClientVersionReports(db)).toBeDefined();expect(read()!.reported_at).toBe(400);
 db.exec("DELETE FROM accounts WHERE id='one'");expect(read()).toBeUndefined();db.close();
});

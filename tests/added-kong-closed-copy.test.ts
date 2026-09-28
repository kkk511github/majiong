import {it,expect} from 'vitest';
import {ruleDefaults} from '../shared/nanjing-rules';
import {ruleSections} from '../src/rule-copy';
it('current B client copy treats added kongs as closed without changing historical v2 copy',()=>{
 const current=ruleSections(ruleDefaults('nj-garden-b-v3')).flat().join('');
 expect(current).toContain('暗杠、直杠、补杠都算杠');expect(current).not.toContain('碰后补杠不算');
 expect(ruleSections(ruleDefaults('nj-garden-v2')).flat().join('')).toContain('碰后补杠不算');
});

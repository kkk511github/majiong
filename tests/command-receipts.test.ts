import { expect, it } from 'vitest';
import { commandDigest, createCommandReceipts } from '../server/command-receipts';
import { createGame, newPlayer, viewFor } from '../shared/engine';
import { forkGame } from '../server/fork-game';

it('命令内容哈希不依赖JSON属性顺序，且账号隔离、容量有界、不泄漏回执', () => {
  expect(commandDigest({ type: 'trustee', enabled: true, requestId: 'a' }))
    .toBe(commandDigest({ requestId: 'a', enabled: true, type: 'trustee' }));
  const store = createCommandReceipts(), g = createGame('123456', 'receipts'); g.players[0] = newPlayer('me', 'me');
  for (let i = 0; i < 4200; i++) {
    const receipt = { account: 'me', requestId: String(i), digest: 'digest', type: 'ready' };
    store.append(g, receipt); store.committed(receipt);
  }
  expect(g.commandReceipts).toHaveLength(512);
  expect(store.find('me', '0')).toBeUndefined();
  expect(store.find('other', '4199', g)).toBeUndefined();
  expect(store.find('me', '4199', g)).toBeDefined();
  const fork = forkGame(g); store.append(fork, { account: 'me', requestId: 'new', digest: 'digest', type: 'ready' });
  expect(g.commandReceipts?.at(-1)?.requestId).toBe('4199');
  expect(viewFor(g, 0)).not.toHaveProperty('commandReceipts');
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';
import { fullMeldFixture } from './previews/table-full-meld-fixture';

// Test the changed source with the real exported engine without rewriting the
// production resource bundle. This does not certify a new Creator release build.
const source = readFileSync('shared/table-3d-layout.ts', 'utf8').replace("from './table-scene'", "from './table-scene.ts'");
const moduleSource = ts.transpileModule(source, { moduleName: 'chunks:///_virtual/table-3d-layout.ts',
  compilerOptions: { module: ts.ModuleKind.System, target: ts.ScriptTarget.ES2022 } }).outputText;
const bundle = readFileSync('public/cocos-table/assets/main/index.js', 'utf8');
const ast = ts.createSourceFile('index.js', bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const registration = ast.statements.find(statement => ts.isExpressionStatement(statement) &&
  ts.isCallExpression(statement.expression) && ts.isPropertyAccessExpression(statement.expression.expression) &&
  statement.expression.expression.name.text === 'register' && ts.isStringLiteral(statement.expression.arguments[0]) &&
  statement.expression.arguments[0].text === 'chunks:///_virtual/table-3d-layout.ts');
if (!registration) throw Error('The exported layout module was not found');
const overlay = bundle.slice(0, registration.getStart(ast)) + moduleSource + bundle.slice(registration.end);

for (const [width, height] of [[568, 320], [844, 390], [1280, 590]]) {
  test(`3D source overlay: full meld bounds, assets and rendered pixels ${width}`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/cocos-table/assets/main/index.js', route => route.fulfill({ body: overlay, contentType: 'application/javascript' }));
    await page.setViewportSize({ width, height });
    await page.goto('/cocos-table/index.html');
    await page.waitForFunction(() => !!(window as any).__JINLING_TABLE_READY__);
    for (const kind of ['pung', 'kong'] as const) {
      const state = { ...fullMeldFixture(kind), tableStyle: 'reference-3d' as const, externalControls: true };
      const result = await page.evaluate(async state => {
        const w = window as any, cc = await w.System.import('cc');
        const scene = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
        scene.state = state; scene.draw();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const melds = [...scene.tileLayout.values()].filter((tile: any) => tile.area === 'meld') as any[];
        return { enabled: w.__JINLING_TABLE_3D__?.enabled, count: melds.length,
          outside: melds.filter(tile => tile.x - tile.w / 2 < 0 || tile.x + tile.w / 2 > 1280 || tile.y - tile.h / 2 < 4 || tile.y + tile.h / 2 > 590).map(tile => tile.id) };
      }, state);
      expect(result.enabled).toBe(true); expect(result.count).toBe(kind === 'kong' ? 64 : 48); expect(result.outside).toEqual([]);
      const pixels = await page.locator('canvas').screenshot({ path: info.outputPath(`${kind}-${width}.png`) });
      const stats = await sharp(pixels).stats();
      expect(stats.channels.slice(0, 3).every(channel => channel.stdev > 20)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { auditNativeWeb, protectClientCode } from "../scripts/native-security";

const dirs: string[] = [];
const endpoint = "https://game.example.invalid/mahjong";
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function bundle(name: string, content: string) {
  const dir = await mkdtemp(join(tmpdir(), "jinling-native-audit-"));
  dirs.push(dir);
  const file = join(dir, name);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, content);
  return dir;
}

it("keeps Unicode, message properties and System.register exports working without eval", () => {
  const source = `System.register("table", [], function (publish) { return { execute() {
    publish("snapshot", { label: "碰杠胡", endpoint: "${endpoint}", rows: [208, 170, 132] });
  } }; });`;
  const code = protectClientCode(source);
  let value: unknown;
  runInNewContext(code, { System: { register(_name: string, _deps: unknown[], factory: (publish: (key: string, result: unknown) => void) => { execute: () => void }) {
    factory((_key, result) => { value = result; }).execute();
  } } }, { timeout: 2000, contextCodeGeneration: { strings: false, wasm: false } });
  expect(value).toEqual({ label: "碰杠胡", endpoint, rows: [208, 170, 132] });
  expect(code).not.toContain("game.example.invalid");
});

it.each([
  ["assets/app.js.map", "{}"],
  ["assets/app.js", "//# sourceMappingURL=data:application/json;base64,e30="],
  ["server/service.ts", "export const secret = 'server';"],
  [".env.native", "PRIVATE_SETTING=value"],
  ["config.json", '{"key":"-----BEGIN PRIVATE KEY-----"}'],
  ["assets/app.js", `fetch('${endpoint}/api/health')`],
])("rejects unsafe bundled content: %s", async (name, content) => {
  await expect(auditNativeWeb(await bundle(name, content), endpoint)).rejects.toThrow();
});

it("allows normal runtime modules and artwork", async () => {
  const dir = await bundle("assets/app.js", protectClientCode(`console.log('${endpoint}')`));
  await writeFile(join(dir, "tile.png"), Buffer.from([137, 80, 78, 71]));
  await expect(auditNativeWeb(dir, endpoint)).resolves.toBe(2);
});

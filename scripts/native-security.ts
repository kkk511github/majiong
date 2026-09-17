import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";

// Raises the cost of static inspection; the decoder lives in the client, so
// this is not a secret store and cannot hide the network destination.
export function protectClientCode(code: string): string {
  if (/!~\{[^}]+\}~/.test(code))
    throw new Error("Native code protection must run after Rollup resolves hashed filenames.");
  return JavaScriptObfuscator.obfuscate(code, {
    target: "browser-no-eval", compact: true, sourceMap: false,
    controlFlowFlattening: false, deadCodeInjection: false,
    debugProtection: false, selfDefending: false,
    renameGlobals: false, renameProperties: false,
    stringArray: true, stringArrayThreshold: 1,
    stringArrayEncoding: ["rc4"], unicodeEscapeSequence: true,
    identifierNamesGenerator: "hexadecimal",
  }).getObfuscatedCode();
}

export async function auditNativeWeb(root: string, endpoint: string): Promise<number> {
  const host = new URL(endpoint).hostname;
  let count = 0;
  async function scan(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name), name = relative(root, file);
      if (entry.isSymbolicLink()) throw new Error(`Native bundle contains a symlink: ${name}`);
      if (entry.isDirectory()) { await scan(file); continue; }
      if (!entry.isFile()) throw new Error(`Unexpected native bundle entry: ${name}`);
      if (/(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|server|tests)(\/|$)|\.(?:map|ts|tsx|p12|pfx|pem|key|jks|keystore|sqlite\d?|db)(?:$|-)/i.test(name))
        throw new Error(`Private or development file in native bundle: ${name}`);
      count++;
      if (!/\.(?:js|json|html|css|txt|xml)$/i.test(name)) continue;
      const content = await readFile(file, "utf8");
      if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content))
        throw new Error(`Private key in native bundle: ${name}`);
      if (/sourceMappingURL\s*=/.test(content))
        throw new Error(`Source map reference in native bundle: ${name}`);
      if (content.includes(host))
        throw new Error(`Unprotected service address in web assets: ${name}`);
    }
  }
  await scan(root);
  return count;
}

export async function protectNativeTable(root: string): Promise<void> {
  // Vite copies Cocos exports from public/ without running renderChunk on them.
  // Protect the application bundle too; leave third-party engine code intact.
  const file = resolve(root, "cocos-table/assets/main/index.js");
  await writeFile(file, protectClientCode(await readFile(file, "utf8")));
}

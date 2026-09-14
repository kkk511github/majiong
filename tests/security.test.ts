import { it, expect } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { makeServer } from "../server/service";

it("静态服务即使存在调试映射或隐藏文件也不提供，正常语音仍可读取", async () => {
  const name = `security-${randomUUID()}`;
  mkdirSync("dist", { recursive: true });
  const files = [`${name}.map`, `.${name}`, `${name}.wav`];
  for (const file of files) writeFileSync(`dist/${file}`, "security-fixture");
  const server = makeServer({
    database: ":memory:",
    host: "127.0.0.1",
    port: 0,
  });
  try {
    const base = `http://127.0.0.1:${await server.listen()}`;
    for (const path of [
      `/${name}.map`,
      `/.${name}`,
      `/%2e${name}`,
      `/server/accounts.ts`,
      `/private.sqlite`,
    ]) {
      const result = await fetch(base + path);
      expect(result.status).toBe(404);
      expect(await result.text()).not.toContain("security-fixture");
      expect(result.headers.get("x-content-type-options")).toBe("nosniff");
      expect(result.headers.get("x-frame-options")).toBe("DENY");
    }
    const audio = await fetch(`${base}/${name}.wav`);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/wav");
    expect(audio.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await audio.text()).toBe("security-fixture");
  } finally {
    await server.close();
    for (const file of files) rmSync(`dist/${file}`, { force: true });
  }
});

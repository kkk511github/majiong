import { afterEach, expect, it, vi } from "vitest";
import { createTableChannel } from "../src/cocos-channel";
import { captureReplay } from "../shared/replay";
import { externalRound } from "./fixtures/external-round";

afterEach(() => vi.unstubAllGlobals());

it("opens an isolated table channel when WebView has no randomUUID", () => {
  const random = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const first = createTableChannel(random), second = createTableChannel(random);
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(second).not.toBe(first);
});

it("uses the platform UUID implementation when available", () => {
  const randomUUID = vi.fn(() => "12345678-1234-4123-8123-123456789abc" as const);
  expect(createTableChannel({ randomUUID, getRandomValues: vi.fn() })).toBe("12345678-1234-4123-8123-123456789abc");
  expect(randomUUID).toHaveBeenCalledOnce();
});

it("saves an independent final replay result without structuredClone", () => {
  const game = externalRound();
  game.replay!.endedAt = undefined;
  vi.stubGlobal("structuredClone", undefined);
  captureReplay(game, "finish", 123456);
  const frame = game.replay!.frames[game.replay!.frames.length - 1];
  expect(frame.result).toEqual(game.result);
  game.result!.externalDeltas![0] = 12345;
  expect(frame.result!.externalDeltas![0]).toBe(-50);
});

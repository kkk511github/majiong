import { expect, it } from "vitest";
import { createGame, newPlayer } from "../shared/engine";
import { DEFAULT_TABLE_SETTINGS, tableSummary } from "../shared/table-settings";

it("约局大厅展示真人头像，隐藏昵称的桌子不泄露其他人的头像", () => {
  const game = createGame("123456", "avatar-lobby");
  game.table = {
    creatorId: "owner", groupId: "group", number: 1, createdAt: 1,
    settings: { ...DEFAULT_TABLE_SETTINGS },
  };
  game.players[0] = newPlayer("owner", "东家");
  game.players[1] = newPlayer("guest", "西家");
  game.players[2] = newPlayer("bot", "机器人", true);
  const avatarFor = (id: string) => `/api/avatars/${id}/photo.jpg`;

  const open = tableSummary(game, "owner", avatarFor);
  expect(open.seats.map(seat => seat?.avatar)).toEqual([
    "/api/avatars/owner/photo.jpg", "/api/avatars/guest/photo.jpg", undefined, undefined,
  ]);

  game.table.settings.privacy = "lobby";
  const privateTable = tableSummary(game, "owner", avatarFor);
  expect(privateTable.seats[0]?.avatar).toBe("/api/avatars/owner/photo.jpg");
  expect(privateTable.seats[1]).toMatchObject({ name: "牌友2", avatar: undefined });
});

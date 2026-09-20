import type { Seat } from "./types";

/** Stable IDs match the user's male/female chat recordings. No custom text. */
export const ROOM_PHRASES = [
  { id: "chat_01", text: "快得儿赛，表摸来" },
  { id: "chat_02", text: "哈能不要摸啦，快得儿哎" },
  { id: "chat_03", text: "嘿嘿，手气好的刹都刹不住" },
  { id: "chat_04", text: "都当心得儿，我听牌老，表放炮喔" },
  { id: "chat_05", text: "乖乖，我手气好的一塌带一麻，又自摸了！" },
  { id: "chat_06", text: "乖乖，我这把牌太好了，你们要当心得儿喔" },
  { id: "chat_07", text: "你这个麻将打的太厉害了包，我要喊你师傅老" },
  { id: "chat_08", text: "你这个牌打的太好了吧，太佩服你了" },
  { id: "chat_09", text: "你牌打的搓的一米，你啊会打牌呀" },
  { id: "chat_10", text: "你哈能好好打牌呀" },
  { id: "chat_11", text: "包意思喔，刚又得儿事，接了个电话" },
  { id: "chat_12", text: "不好意思，刚又得事耽误了一下" },
] as const;
export type RoomPhraseId = typeof ROOM_PHRASES[number]["id"];
export const ROOM_PHRASE_TTL_MS = 6000;
export const ROOM_PHRASE_HISTORY_LIMIT = 8;
export const ROOM_PHRASE_SEND_INTERVAL_MS = 2000;
export const ROOM_PHRASE_TEXT = Object.freeze(Object.fromEntries(
  ROOM_PHRASES.map(phrase => [phrase.id, phrase.text]),
) as Record<RoomPhraseId, string>);
const ids = new Set<string>(ROOM_PHRASES.map(phrase => phrase.id));
export const isRoomPhraseId = (value: unknown): value is RoomPhraseId =>
  typeof value === "string" && ids.has(value);

export interface RoomPhraseMessage {
  id: string;
  game: string;
  sender: string;
  name: string;
  seat: Seat;
  phrase: RoomPhraseId;
  at: number;
}
export function isRoomPhraseMessage(value: unknown): value is RoomPhraseMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<RoomPhraseMessage>;
  return typeof message.id === "string" && message.id.length > 0 && message.id.length <= 128 &&
    typeof message.game === "string" && message.game.length > 0 && message.game.length <= 128 &&
    typeof message.sender === "string" && message.sender.length > 0 && message.sender.length <= 128 &&
    typeof message.name === "string" && message.name.length <= 80 &&
    Number.isInteger(message.seat) && message.seat! >= 0 && message.seat! <= 3 &&
    isRoomPhraseId(message.phrase) && Number.isSafeInteger(message.at) && message.at! >= 0;
}

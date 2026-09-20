import { isRoomPhraseId, type RoomPhraseId } from "../shared/room-phrases";

export type PhraseVoiceGender = "male" | "female";

/** Only the shared, fixed phrase IDs can address a bundled recording. */
export function phraseAudioUrl(id: RoomPhraseId, gender: PhraseVoiceGender): string {
  if (!isRoomPhraseId(id) || (gender !== "male" && gender !== "female")) {
    throw new Error("无效的固定短句录音");
  }
  return `${import.meta.env.BASE_URL}audio/phrases/${gender}/${id}.mp3`;
}

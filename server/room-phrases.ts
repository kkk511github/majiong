import { ROOM_PHRASE_SEND_INTERVAL_MS, type RoomPhraseId } from "../shared/room-phrases";

/** Ephemeral throttling/idempotency receipts only: never a chat history. */
export function createPhraseGate() {
  const senders = new Map<string, { at: number; receipts: Map<string, { game: string; phrase: RoomPhraseId; at: number }> }>();
  return (sender: string, game: string, phrase: RoomPhraseId, request: string, now = Date.now()) => {
    if (senders.size > 1000)
      for (const [id, state] of senders) if (now - state.at > 60000) senders.delete(id);
    const state = senders.get(sender);
    const receipt = state?.receipts.get(request);
    if (receipt && now - receipt.at < 60000) {
      if (receipt.game !== game || receipt.phrase !== phrase) throw Error("短句请求已使用，请重新选择短句");
      return false;
    }
    if (state && now - state.at < ROOM_PHRASE_SEND_INTERVAL_MS) throw Error("发送太快了，请稍候再发");
    const receipts = new Map([...(state?.receipts ?? [])].filter(([, item]) => now - item.at < 60000));
    receipts.set(request, { game, phrase, at: now });
    while (receipts.size > 8) receipts.delete(receipts.keys().next().value!);
    senders.set(sender, { at: now, receipts });
    return true;
  };
}

import type { IncomingMessage } from "node:http";
import { AuthError } from "./accounts";
import { VOICE_MAX_BYTES, voiceDuration } from "../shared/room-voice";
export function readVoice(
  req: IncomingMessage,
): Promise<{ bytes: Buffer; duration: number }> {
  if (req.headers["content-type"]?.split(";")[0] !== "audio/wav")
    throw new AuthError("只支持应用录制的语音", 415);
  if (Number(req.headers["content-length"]) > VOICE_MAX_BYTES)
    throw new AuthError("语音不能超过 15 秒", 413);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0,
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      req.removeListener("data", data);
      req.removeListener("end", end);
      req.removeListener("error", fail);
      req.removeListener("aborted", aborted);
      if (error) {
        req.resume();
        reject(error);
      } else {
        try {
          const bytes = Buffer.concat(chunks);
          resolve({ bytes, duration: voiceDuration(bytes) });
        } catch {
          reject(new AuthError("语音格式或时长不正确"));
        }
      }
    };
    const data = (chunk: Buffer) => {
      length += chunk.length;
      if (length > VOICE_MAX_BYTES)
        finish(new AuthError("语音不能超过 15 秒", 413));
      else chunks.push(chunk);
    };
    const end = () => finish(),
      fail = () => finish(new AuthError("语音上传中断")),
      aborted = fail;
    const timer = setTimeout(
      () => finish(new AuthError("语音上传超时", 408)),
      10000,
    );
    req.on("data", data);
    req.on("end", end);
    req.on("error", fail);
    req.on("aborted", aborted);
  });
}

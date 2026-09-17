"""Append the user's hu recording without changing any existing tile/action PCM."""
from pathlib import Path
import hashlib
import json
import shutil
import wave

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/audio/hu-male-user-v1.wav"
FEMALE_SOURCE = ROOT / "public/audio/hu-female-ai-v2.wav"


def read_pcm(path):
    with wave.open(str(path), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 24000):
            raise ValueError(f"Expected mono, 16-bit, 24000 Hz PCM: {path}")
        return audio.readframes(audio.getnframes())


def apply_hu_voice(source=SOURCE):
    source = Path(source)
    read_pcm(source)
    if source.resolve() != SOURCE.resolve():
        shutil.copyfile(source, SOURCE)
    report = {
        "source": "用户提供的胡了.wav",
        "sourceAsset": "/audio/hu-male-user-v1.wav",
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "decision": "男声使用用户提供的胡了；女声使用用户试听确认的 AI 女声 v2；胡牌和自摸按所选语音包播放。",
        "femaleApproval": "2026-09-16 用户确认：可以就这样，女声用这个。此前已确认声音复刻授权。",
        "processing": "Approved male/female clip PCM copied exactly; no additional pitch, speed or volume changes.",
        "packs": {},
    }
    for gender in ("male", "female"):
        clip = SOURCE if gender == "male" else FEMALE_SOURCE
        hu_pcm = read_pcm(clip)
        digest = hashlib.sha256(clip.read_bytes()).hexdigest()
        # Always start from the original sprite, making re-runs idempotent.
        base_pcm = read_pcm(ROOT / f"public/audio/nanjing-{gender}.wav")
        filename = f"nanjing-{gender}-hu-{digest[:8]}.wav"
        with wave.open(str(ROOT / "public/audio" / filename), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(24000)
            output.writeframes(base_pcm + hu_pcm)
        cue = [len(base_pcm) / 48000, len(hu_pcm) / 48000]
        config_path = ROOT / f"src/nanjing-{gender}.json"
        pack = json.loads(config_path.read_text())
        pack["file"] = "/audio/" + filename
        for action in ("胡了", "自摸", "定章"):
            pack["actions"][action] = cue
        config_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n")
        report["packs"][gender] = {"file": pack["file"], "cue": cue, "aliases": ["胡了", "自摸", "定章"], "voice": gender, "sourceAsset": "/audio/" + clip.name, "sourceSha256": digest}
    (ROOT / "docs/research/hu-voice-mapping.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, nargs="?", default=SOURCE)
    apply_hu_voice(parser.parse_args().source)

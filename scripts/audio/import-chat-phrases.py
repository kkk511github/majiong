"""Copy the user's original short-chat MP3s unchanged and verify decoding.

macOS Core Audio (afconvert) is used only for validation. No decoded audio is
shipped and no trimming, normalization, resampling or speed change is applied.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import wave


def inspect_audio(source, decoded):
    subprocess.run(["/usr/bin/afconvert", "-f", "WAVE", "-d", "LEI16", str(source), str(decoded)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    with wave.open(str(decoded), "rb") as stream:
        rate, channels, frames = stream.getframerate(), stream.getnchannels(), stream.getnframes()
        data = stream.readframes(frames)
        if stream.getsampwidth() != 2:
            raise ValueError("Unexpected validation PCM format")
    samples = [value[0] / 32768 for value in struct.iter_unpack("<h", data)]
    duration = frames / rate
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    if not 0.3 <= duration <= 15 or peak < 0.02 or rms < 0.003:
        raise ValueError(f"Invalid or silent chat recording: {source.name}")
    return {"duration": round(duration, 6), "sampleRate": rate, "channels": channels,
            "decodedFrames": frames, "peak": round(peak, 6), "rms": round(rms, 6)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="The user-provided 南京麻将_njyz directory")
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[2]
    target = project / "public/audio/phrases"
    report = {"source": "用户提供 南京话语音包 / 南京麻将_njyz", "unchangedOriginalMp3": True,
              "processing": "byte-for-byte copy; validation decode only", "packs": {}}
    entries = []
    with tempfile.TemporaryDirectory(prefix="jinling-chat-audio-") as temporary:
        for folder, gender in (("boy", "male"), ("girl", "female")):
            report["packs"][gender] = {}
            for index in range(1, 13):
                ident = f"chat_{index:02d}"
                matches = list((args.source / folder).glob(f"{ident}_*.mp3"))
                if len(matches) != 1:
                    raise ValueError(f"Expected exactly one {folder}/{ident} recording")
                source = matches[0]
                metadata = inspect_audio(source, Path(temporary) / f"{gender}-{ident}.wav")
                digest = hashlib.sha256(source.read_bytes()).hexdigest()
                metadata.update({"source": f"{folder}/{source.name}", "file": f"/audio/phrases/{gender}/{ident}.mp3",
                                 "bytes": source.stat().st_size, "sourceSha256": digest, "sha256": digest})
                report["packs"][gender][ident] = metadata
                entries.append((source, target / gender / f"{ident}.mp3", digest))
        # Validate the entire supplied set before publishing any local resource.
        for source, destination, digest in entries:
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary_file = destination.with_suffix(".mp3.tmp")
            shutil.copyfile(source, temporary_file)
            if hashlib.sha256(temporary_file.read_bytes()).hexdigest() != digest:
                raise ValueError("Chat audio copy checksum mismatch")
            temporary_file.replace(destination)
    (target / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"clips": len(entries), "bytes": sum(item[1].stat().st_size for item in entries),
                      "minimumSeconds": min(m["duration"] for p in report["packs"].values() for m in p.values()),
                      "maximumSeconds": max(m["duration"] for p in report["packs"].values() for m in p.values()),
                      "unchangedOriginalMp3": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()

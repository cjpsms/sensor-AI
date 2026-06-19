#!/usr/bin/env python3
import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1] if len(sys.argv) > 1 else None
if not audio_path:
    print("", end="")
    sys.exit(0)

model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
segments, _ = model.transcribe(
    audio_path,
    language="th",
    vad_filter=True,
    vad_parameters={"min_silence_duration_ms": 300},
    condition_on_previous_text=False,   # ป้องกัน hallucinate ต่อจากตัวเอง
    no_speech_threshold=0.6,            # ตัดช่วงที่ไม่มีเสียงพูดออก
    temperature=0,                      # greedy decode — ลด hallucination
)
print("".join(s.text for s in segments).strip(), end="")

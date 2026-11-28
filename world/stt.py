"""Распознавание речи гостя: модель Whisper в памяти (нужна видеокарта NVIDIA), на вход строки JSON {"id","wav"}, на выход {"id","text","sec"}.
Запуск: python stt.py large-v3 <папка моделей> (модель скачается туда при первом запуске)."""
import json
import os
import sysconfig
import sys
import time
from pathlib import Path

# библиотеки видеокарты лежат в пакетах nvidia рядом с Whisper
SITE = Path(sysconfig.get_paths()["purelib"])
for d in (SITE / "nvidia" / "cublas" / "bin", SITE / "nvidia" / "cudnn" / "bin", SITE / "nvidia" / "cuda_nvrtc" / "bin", SITE / "ctranslate2"):
    if d.is_dir():
        os.add_dll_directory(str(d))
        os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")

from faster_whisper import WhisperModel  # noqa: E402

# Whisper на тишине и шуме выдумывает такие фразы — их выбрасываем.
JUNK = ("субтитры", "продолжение следует", "спасибо за просмотр", "редактор субтитров", "dimatorzok", "подписывайтесь")

t = time.time()
model = WhisperModel(sys.argv[1], device="cuda", compute_type="float16", download_root=sys.argv[2] if len(sys.argv) > 2 else None)
print(json.dumps({"ready": True, "sec": round(time.time() - t, 1)}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    t = time.time()
    try:
        segs, _ = model.transcribe(req["wav"], language="ru", beam_size=3, vad_filter=True,
                                   condition_on_previous_text=False, hotwords="Fable, Фейбл",
                                   no_speech_threshold=0.5)
        text = " ".join(s.text.strip() for s in segs).strip()
        if any(j in text.lower() for j in JUNK) and len(text) < 60:
            text = ""
    except Exception as e:  # граница: файл от браузера может быть битым
        text = ""
        print(f"stt error: {e}", file=sys.stderr, flush=True)
    print(json.dumps({"id": req["id"], "text": text, "sec": round(time.time() - t, 2)}, ensure_ascii=False), flush=True)

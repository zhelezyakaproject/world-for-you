"""Распознавание речи гостя моделью GigaAM v3 от Сбера: связь с сервером та же, что у stt.py — на вход строки JSON {"id","wav"}, на выход {"id","text","sec"}.

Запуск: python stt_gigaam.py <модель> <папка моделей> (модель скачается туда при первом запуске). Модель v3_e2e_rnnt пишет текст со знаками и заглавными.
GigaAM за раз берёт ≤25 с, поэтому фраза длиннее 20 с режется в самом тихом месте. В тишине текст не сочиняет.
"""
import json
import sys
import time
import wave
from pathlib import Path

import numpy as np
import sentencepiece
import torch

import gigaam
import gigaam.model

# sentencepiece на Windows не открывает путь с кириллицей (например, «Мои документы»): файл читается здесь и отдаётся байтами.
sentencepiece.SentencePieceProcessor.LoadFromFile = lambda self, path: self.LoadFromSerializedProto(Path(path).read_bytes())

RATE, HOP, MAX, MIN = 16000, 160, 20.0, 12.0


def read16(path: str) -> np.ndarray:
    """Фраза от сервера: wav 16 кГц, моно, 16 бит."""
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


# GigaAM сам читает звук через ffmpeg; фраза уже лежит в нужном виде — отдаём ему готовый звук без стороннего процесса.
gigaam.model.load_audio = lambda a, sample_rate=RATE: torch.from_numpy(a if isinstance(a, np.ndarray) else read16(a))


def pieces(x: np.ndarray) -> list:
    """Куски ≤20 с: длинная фраза режется в самом тихом месте между 12 и 20 с."""
    out, a = [], 0
    while len(x) - a > MAX * RATE:
        lo = a + int(MIN * RATE)
        seg = x[lo:a + int(MAX * RATE)]
        cut = lo + int(np.argmin((seg[: len(seg) // HOP * HOP].reshape(-1, HOP) ** 2).mean(1))) * HOP
        out.append(x[a:cut])
        a = cut
    out.append(x[a:])
    return out


t = time.time()
model = gigaam.load_model(sys.argv[1], download_root=sys.argv[2])
model.transcribe(np.zeros(RATE, np.float32))  # первая фраза иначе ждёт прогрева видеокарты ~3 с
print(json.dumps({"ready": True, "sec": round(time.time() - t, 1)}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = json.loads(line)
    t = time.time()
    try:
        text = " ".join(model.transcribe(p).text.strip() for p in pieces(read16(req["wav"])) if len(p) > RATE // 10).strip()
    except Exception as e:  # граница: файл от браузера может быть битым
        text = ""
        print(f"stt error: {e}", file=sys.stderr, flush=True)
    print(json.dumps({"id": req["id"], "text": text, "sec": round(time.time() - t, 2)}, ensure_ascii=False), flush=True)

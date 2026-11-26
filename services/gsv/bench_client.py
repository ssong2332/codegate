# 실측 클라이언트(§143.12 M1 · M3 · M2의 합성 구간) — 배포된 서비스에 PC에서 붙어 잰다. ⛔ 실 과금(Modal T4) — 매번 승인.
# 실행: GSV_BENCH_KEY=<32바이트 base64> python services/gsv/bench_client.py <엔드포인트 https://…modal.run> <참조 녹음 wav> <출력 폴더>
# 억양 시험(§143.19): 넷째 인자 `sweep` = 아래 COMBOS를 한 세션(같은 컨테이너)에서 차례로 — 조합별 폴더 + 받아쓰기 오류율(CER).
# 참조 녹음은 Windows Heami TTS 같은 합성 음성만(실제 사람 녹음 금지 — §143.12). 참조는 data: URL로 토큰에 싣는다(시험 전용).
import asyncio, base64, json, os, subprocess, sys, time, urllib.request, wave
import websockets
from gsvtoken import seal_token

SENTENCES = [
    "여보세요?",
    "엄마, 나야. 지금 통화 괜찮아?",
    "놀라지 말고 들어, 나 지금 좀 큰일 났어.",
    "친구 폰 빌려서 전화하는 거야. 내 폰이 고장 났거든.",
    "지금은 길게 설명 못 하니까 이따가 문자로 다시 연락할게, 알았지?",
    "아니, 그게 아니라 내가 지금 진짜 정신이 없어서 그래. 조금만 기다려 줘.",
    "오늘 저녁 일곱 시 반까지는 꼭 정리해야 하는데, 혼자서는 도저히 안 될 것 같아서 연락했어.",
    "걱정하지 마. 내가 다 설명할게. 그러니까 일단 다른 사람한테는 아직 말하지 말아 줘.",
]

# GPT 생성 설정 조합(§143.19) — 기준 = 사전학습 기본값(gen 없음 · 운영과 같음).
COMBOS = [
    ("A_base", {}),
    ("B_k15", {"top_k": 15, "top_p": 1.0, "temperature": 1.0}),
    ("C_k20_t12", {"top_k": 20, "top_p": 0.9, "temperature": 1.2}),
    ("D_k30_t135", {"top_k": 30, "top_p": 0.95, "temperature": 1.35, "repetition_penalty": 1.2}),
]


def cer(ref: str, hyp: str) -> float:
    import re
    a, b = (re.sub(r"[\s\W_]", "", x) for x in (ref, hyp))
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
    return d[len(b)] / max(1, len(a))


def post(url, body, timeout=300):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read()), time.time() - t


def data_url(b: bytes, mime="audio/wav"):
    return f"data:{mime};base64,{base64.b64encode(b).decode()}"


def to_flac(wav: bytes) -> bytes:
    # 시험 전용 — Modal 웹소켓 메시지 상한(실측 약 2MB) 안에 참조 4개를 싣기 위해 무손실 FLAC으로. 운영 토큰은 서명 URL이라 작다.
    # 파이프 출력은 길이 머리말(STREAMINFO 표본 수)이 비어 받는 쪽 soundfile이 크기를 잘못 읽는다 → 임시 파일로.
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "a.wav"), os.path.join(d, "a.flac")
        open(src, "wb").write(wav)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-i", src, dst], check=True)
        return open(dst, "rb").read()


async def synth(endpoint, key, clips, out, gen=None, asr=False):
    refs = [{"url": data_url(to_flac(base64.b64decode(c["wav"])), "audio/flac"), "text": c["text"]} for c in clips]
    token = seal_token({"kind": "synth", "exp": time.time() + 1500, "voiceId": "bench", "charBudget": 3000, "refs": refs, "banned": [], **({"gen": gen} if gen else {}), **({"asr": True} if asr else {})}, key)
    ws_url = endpoint.replace("https://", "wss://") + "/ws"
    rows = []
    print("token bytes", len(token), flush=True)
    t0 = time.time()
    async with websockets.connect(ws_url, max_size=None) as ws:
        await ws.send(json.dumps({"type": "auth", "token": token}))
        ready = json.loads(await ws.recv())
        ready_sec = time.time() - t0
        for i, text in enumerate(SENTENCES, 1):
            pcm, first, ts, heard = bytearray(), None, time.time(), None
            await ws.send(json.dumps({"type": "say", "id": i, "text": text}))
            while True:
                m = await ws.recv()
                if isinstance(m, bytes):
                    first = first or time.time() - ts
                    pcm += m[4:]
                    continue
                j = json.loads(m)
                if j.get("type") in ("done", "rejected"):
                    heard = j.get("asr")
                    break
            total = time.time() - ts
            audio_sec = len(pcm) / 2 / ready["sr"]
            with wave.open(os.path.join(out, f"m1_{i}.wav"), "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(ready["sr"]); w.writeframes(bytes(pcm))
            rows.append({"i": i, "chars": len(text), "firstSec": round(first or -1, 2), "totalSec": round(total, 2),
                         "audioSec": round(audio_sec, 2), "rtf": round(total / audio_sec, 3) if audio_sec else None,
                         **({"asr": heard, "cer": round(cer(text, heard), 3)} if heard is not None else {})})
            print(rows[-1], flush=True)
    return ready_sec, rows


def main():
    endpoint, ref_wav, out = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
    key = os.environ["GSV_BENCH_KEY"]
    os.makedirs(out, exist_ok=True)
    res = {}
    warm, res["warmSec"] = post(f"{endpoint}/warm", {"token": seal_token({"kind": "warm", "exp": time.time() + 300}, key)})
    print("warm", res["warmSec"], warm, flush=True)
    audio = open(ref_wav, "rb").read()
    prep, res["prepareSec"] = post(f"{endpoint}/prepare", {"token": seal_token({"kind": "prepare", "exp": time.time() + 600, "audioUrl": data_url(audio)}, key)})
    print("prepare", res["prepareSec"], prep.get("ok"), [(c["line"], c["sec"], c["text"]) for c in prep.get("clips", [])], flush=True)
    if not prep.get("ok"):
        res["prepare"] = prep
    else:
        res["refs"] = [{k: c[k] for k in ("line", "sec", "text")} for c in prep["clips"]]
        sweep = len(sys.argv) > 4 and sys.argv[4] == "sweep"
        for name, gen in (COMBOS if sweep else [("", None)]):
            d = os.path.join(out, name) if name else out
            os.makedirs(d, exist_ok=True)
            r = res.setdefault("combos", {}).setdefault(name or "default", {"gen": gen})
            r["wsReadySec"], r["rows"] = asyncio.run(synth(endpoint, key, prep["clips"], d, gen, asr=sweep))
            rows = r["rows"]
            r["avgFirstSec"] = round(sum(x["firstSec"] for x in rows) / len(rows), 2)
            r["avgRtf"] = round(sum(x["rtf"] for x in rows) / len(rows), 3)
            if sweep:
                r["cer"] = round(sum(cer(t, x["asr"]) * len(t) for t, x in zip(SENTENCES, rows)) / sum(map(len, SENTENCES)), 3)
            print(name, {k: v for k, v in r.items() if k != "rows"}, flush=True)
    json.dump(res, open(os.path.join(out, "bench.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != "combos"}, ensure_ascii=False))


if __name__ == "__main__":
    main()

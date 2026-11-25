# 복제 목소리 합성 서비스(Architecture.md §143) — Modal T4 · GPT-SoVITS v2Pro 제로샷(D1) · fp16.
# 배포: python -m modal deploy services/gsv/app.py   (Modal Secret `gsv-token`에 GSV_TOKEN_KEY — Functions와 같은 값)
# 엔드포인트(모두 우리 토큰으로 인증 — Modal 프록시 인증 없음):
#   POST /prepare   {token}  → 녹음에서 참조 1 + 보조 3 골라 wav(base64) + 글 반환. 디스크는 요청 안에서 지움(§143.7 P4)
#   POST /warm      {token}  → 즉시 200(컨테이너가 떠 있다는 뜻 — 호출 자체가 콜드 스타트를 일으킨다)
#   WS   /ws  첫 메시지 {"type":"auth","token"} → {"type":"say","id","text"} · {"type":"cancel"} 받고, 바이너리 = id(uint32 LE) + PCM16 LE 32kHz mono
# ⛔ 로그에 음성 · 본문 글 0(종류 · 길이 · 시간만). ⛔ Volume · Dict 사용 0(test_gsv.py NoPersistTest).
import asyncio, base64, io, json, os, shutil, struct, subprocess, sys, tempfile, threading, time, urllib.request
import modal

HERE = os.path.dirname(os.path.abspath(__file__))
COMMIT = "6d51ffceafbf240145619af4c92408a6e54b7924"  # 2026-11-24 로컬 · 2026-11-26 Modal T4에서 검증한 커밋
GSV = "/GPT-SoVITS"
SR_OUT = 32000

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "build-essential", "cmake")
    .run_commands(f"git clone -q https://github.com/RVC-Boss/GPT-SoVITS.git {GSV} && cd {GSV} && git checkout -q {COMMIT}",
                  f"grep -v -- '--no-binary' {GSV}/requirements.txt > /req.txt")
    .pip_install("torch==2.6.0", "torchaudio==2.6.0", index_url="https://download.pytorch.org/whl/cu124")
    .run_commands("pip install -q -r /req.txt huggingface_hub resampy 'setuptools<70' 'gradio==4.44.1' faster-whisper fastapi cryptography",
                  "python -c \"from mecab import MeCab; print(MeCab().morphs('안녕하세요'))\"",
                  f"cd {GSV} && python -c \"from huggingface_hub import snapshot_download; snapshot_download('lj1995/GPT-SoVITS', local_dir='GPT_SoVITS/pretrained_models', allow_patterns=['chinese-hubert-base/*','chinese-roberta-wwm-ext-large/*','v2Pro/s2Gv2Pro.pth','s1v3.ckpt','sv/*'])\"",
                  "python -c \"from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')\"")
    .add_local_python_source("gsvtoken", "refpick", "textguard")
)
app = modal.App("codegate-gsv", image=image)

SCRIPT = [  # src/app/onboarding/record/page.tsx SCRIPT_LINES와 같은 순서 · 같은 글(gsvScript.test.ts가 대조)
    ("또박또박", "안녕하세요. 지금부터 제 목소리를 천천히 녹음해 보겠습니다."),
    ("묻듯이", "오늘 저녁에 떡볶이 먹을까? 혹시 내일 오후에 시간 괜찮아요?"),
    ("다급하게", "잠깐만, 빨리 와 줘! 지금 정말 급하단 말이야!"),
    ("걱정스럽게", "어떡하지... 너무 걱정돼서 아무것도 손에 안 잡혀."),
    ("기쁘게", "와, 진짜 잘됐다! 정말 축하해!"),
    ("미안한 듯", "미안해, 내가 실수했어. 한 번만 이해해 줄래?"),
    ("놀라서", "뭐라고? 정말이야? 믿을 수가 없네."),
    ("짜증 내듯", "아, 진짜 왜 그래! 그만 좀 해!"),
    ("숫자를 또렷이", "약속은 오후 세 시 사십오 분이고, 번호는 공일공, 삼사오육, 칠팔구공이야."),
    ("가볍게", "응, 알겠어. 아니야, 괜찮아."),
    ("차분하게", "전화로 다급한 이야기를 들으면, 먼저 끊고 직접 확인하겠습니다."),
]


def _log(event: str, **kw):
    print(json.dumps({"event": event, **kw}, ensure_ascii=False), flush=True)


def _fetch(url: str, path: str):
    with urllib.request.urlopen(url, timeout=30) as r, open(path, "wb") as f:
        shutil.copyfileobj(r, f)


@app.cls(gpu="T4", timeout=1800, scaledown_window=300, secrets=[modal.Secret.from_name("gsv-token")])
@modal.concurrent(max_inputs=1)  # 1통화 = 1컨테이너(T4 RTF 0.556 — 두 통화면 실시간 미달 추정 · §143.13)
class Gsv:
    @modal.enter()
    def load(self):
        t0 = time.time()
        os.chdir(GSV)
        sys.path[:0] = [GSV, os.path.join(GSV, "GPT_SoVITS")]
        from TTS_infer_pack.TTS import TTS, TTS_Config
        from faster_whisper import WhisperModel
        cfg = TTS_Config("GPT_SoVITS/configs/tts_infer.yaml")
        cfg.device, cfg.is_half = "cuda", True  # fp16 확정(2026-11-26 사용자 결정)
        cfg.update_version("v2Pro")
        cfg.t2s_weights_path = "GPT_SoVITS/pretrained_models/s1v3.ckpt"  # D1 제로샷 = 사전학습 GPT
        cfg.vits_weights_path = "GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth"
        self.tts = TTS(cfg)
        self.whisper = WhisperModel("small", device="cuda", compute_type="float16")
        self.key = os.environ["GSV_TOKEN_KEY"]
        self.lock = threading.Lock()  # TTS 객체는 한 번에 하나
        _log("loaded", sec=round(time.time() - t0, 1))

    @modal.asgi_app()
    def web(self):
        from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
        from gsvtoken import TokenError, open_token
        from refpick import pick
        from textguard import Budget, gen_params
        api = FastAPI()

        def auth(token, kind):
            try:
                return open_token(token or "", self.key, kind)
            except TokenError as e:
                _log("auth_fail", kind=kind, why=str(e))
                raise HTTPException(401)

        @api.post("/warm")
        def warm(body: dict):
            auth(body.get("token"), "warm")
            return {"ok": True}

        @api.post("/prepare")
        def prepare(body: dict):
            t = auth(body.get("token"), "prepare")
            tmp = tempfile.mkdtemp()
            try:
                src, wav = os.path.join(tmp, "in"), os.path.join(tmp, "in.wav")
                _fetch(t["audioUrl"], src)
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", str(SR_OUT), wav], check=True)
                segs, _ = self.whisper.transcribe(wav, language="ko", vad_filter=True)
                segs = [(s.start, s.end, s.text.strip()) for s in segs]
                r = pick(segs, SCRIPT)
                _log("prepare", ok=r["ok"], readLines=r.get("readLines"), segs=len(segs))
                if not r["ok"]:
                    return {"ok": False, "reason": r["reason"]}
                clips = []
                for i, c in enumerate([r["main"], *r["aux"]]):
                    out = os.path.join(tmp, f"c{i}.wav")
                    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ss", f"{max(0, c['start'] - 0.1):.2f}",
                                    "-to", f"{c['end'] + 0.15:.2f}", out], check=True)
                    clips.append({"line": c["line"], "text": c["text"], "sec": round(c["end"] - c["start"], 2),
                                  "wav": base64.b64encode(open(out, "rb").read()).decode()})
                return {"ok": True, "clips": clips}
            finally:
                shutil.rmtree(tmp, ignore_errors=True)  # §143.7 P4

        @api.websocket("/ws")
        async def ws(sock: WebSocket):
            await sock.accept()
            try:  # 첫 메시지 = {"type":"auth","token"} — 토큰이 몇 KB라 주소에 싣지 않는다
                first_msg = json.loads(await asyncio.wait_for(sock.receive_text(), 10))
                t = open_token(str(first_msg.get("token", "")), self.key, "synth")
            except (TokenError, ValueError, asyncio.TimeoutError) as e:
                _log("auth_fail", kind="synth", why=str(e))
                await sock.close(code=4401)
                return
            tmp = tempfile.mkdtemp()
            cancel = threading.Event()
            started = time.time()
            try:
                paths = []
                for i, ref in enumerate(t["refs"]):  # refs[0] = 기본 참조(글 포함), 나머지 = 보조
                    p = os.path.join(tmp, f"r{i}.wav")
                    await asyncio.to_thread(_fetch, ref["url"], p)
                    paths.append(p)
                base = {"text_lang": "ko", "ref_audio_path": paths[0], "prompt_text": t["refs"][0]["text"], "prompt_lang": "ko",
                        "aux_ref_audio_paths": paths[1:], "text_split_method": "cut5", "batch_size": 1, "seed": 1234,
                        "streaming_mode": True, **gen_params(t.get("gen"))}  # §143.19 — 운영 토큰엔 gen 없음 = 기본값
                asr = bool(t.get("asr"))  # §143.19 시험 전용(실측 클라이언트가 봉인) — 합성 결과 받아쓰기를 done에 싣는다
                budget = Budget(int(t.get("charBudget", 3000)), t.get("banned", []))

                def prime():  # 참조 특징 추출(첫 합성에 약 5.5초 — M1 실측)을 준비 단계로 옮긴다(벨 울리는 동안)
                    with self.lock:
                        for _ in self.tts.run({**base, "text": "네.", "streaming_mode": False}):
                            pass

                await asyncio.to_thread(prime)
                await sock.send_text(json.dumps({"type": "ready", "sr": SR_OUT}))
                _log("ws_ready", prepSec=round(time.time() - started, 2))
                loop = asyncio.get_running_loop()
                inbox: asyncio.Queue = asyncio.Queue()

                async def reader():  # 받은 메시지는 전부 여기로 — cancel은 합성 중에도 즉시 반영
                    try:
                        while True:
                            m = json.loads(await sock.receive_text())
                            if m.get("type") == "cancel":
                                cancel.set()
                                while not inbox.empty():  # 아직 안 한 조각도 버린다
                                    inbox.get_nowait()
                            elif m.get("type") == "say":
                                await inbox.put(m)
                    finally:
                        await inbox.put(None)

                reading = asyncio.ensure_future(reader())
                while (msg := await inbox.get()) is not None:
                    sid, text = int(msg.get("id", 0)), str(msg.get("text", ""))
                    why = budget.check(text)
                    if why:
                        _log("say_rejected", why=why, chars=len(text))
                        await sock.send_text(json.dumps({"type": "rejected", "id": sid, "why": why}))
                        continue
                    cancel.clear()
                    t0, first, heard = time.time(), None, []

                    def gen():
                        nonlocal first
                        with self.lock:
                            for _sr, a in self.tts.run({**base, "text": text}):
                                if cancel.is_set():
                                    self.tts.stop()
                                    break
                                pcm = (a.clip(-1, 1) * 32767).astype("<i2") if a.dtype.kind == "f" else a.astype("<i2")
                                asyncio.run_coroutine_threadsafe(sock.send_bytes(struct.pack("<I", sid) + pcm.tobytes()), loop).result()
                                if asr:
                                    heard.append(pcm)
                                first = first or time.time() - t0

                    await asyncio.to_thread(gen)
                    done = {"type": "done", "id": sid, "cancelled": cancel.is_set()}
                    if asr and heard:
                        import numpy as np
                        a = np.concatenate(heard).astype("float32") / 32768
                        a = a[: len(a) // 2 * 2].reshape(-1, 2).mean(axis=1)  # 32k → 16k(받아쓰기 입력)
                        segs = await asyncio.to_thread(lambda: list(self.whisper.transcribe(a, language="ko")[0]))  # 생성기라 스레드 안에서 다 돌린다
                        done["asr"] = " ".join(x.text.strip() for x in segs)
                    await sock.send_text(json.dumps(done, ensure_ascii=False))
                    _log("say", chars=len(text), firstSec=round(first or -1, 2), sec=round(time.time() - t0, 2), cancelled=cancel.is_set())
                reading.cancel()
            except WebSocketDisconnect:
                pass
            finally:
                cancel.set()
                shutil.rmtree(tmp, ignore_errors=True)  # §143.7 P3 · P4 — 참조 파일 · 캐시 경로 제거
                self.tts.prompt_cache["ref_audio_path"] = None
                _log("ws_closed", sec=round(time.time() - started, 1))

        return api

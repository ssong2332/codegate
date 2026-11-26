# 실행: python -m unittest discover -s services/gsv   (GPU · 모델 · 네트워크 0)
import ast, os, unittest
from gsvtoken import TokenError, open_token, seal_token
from refpick import pick
from textguard import Budget, gen_params

KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="  # 시험 전용(0..31)
SCRIPT = [("또박또박", "안녕하세요. 지금부터 제 목소리를 천천히 녹음해 보겠습니다."),
          ("묻듯이", "오늘 저녁에 떡볶이 먹을까? 혹시 내일 오후에 시간 괜찮아요?"),
          ("다급하게", "잠깐만, 빨리 와 줘! 지금 정말 급하단 말이야!"),
          ("걱정스럽게", "어떡하지... 너무 걱정돼서 아무것도 손에 안 잡혀."),
          ("기쁘게", "와, 진짜 잘됐다! 정말 축하해!"),
          ("미안한 듯", "미안해, 내가 실수했어. 한 번만 이해해 줄래?"),
          ("놀라서", "뭐라고? 정말이야? 믿을 수가 없네.")]
# Node `functions/src/voice/gsvToken.ts`가 같은 키 · iv 0으로 만든 값(언어 간 호환 고정 — gsvToken.test.ts와 같은 문자열).
NODE_VECTOR = "AAAAAAAAAAAAAAAAdZ7et9tIoYcq29BbbESztfAmLiMKu1IfsK6Ds_XPbWYzooBg-ByA9w-TEO-q76G0hQ"


class TokenTest(unittest.TestCase):
    def test_roundtrip_and_checks(self):
        t = seal_token({"kind": "synth", "exp": 2e9, "v": "x"}, KEY)
        self.assertEqual(open_token(t, KEY, "synth", now=1e9)["v"], "x")
        with self.assertRaises(TokenError):
            open_token(t, KEY, "prepare", now=1e9)
        with self.assertRaises(TokenError):
            open_token(t, KEY, "synth", now=3e9)
        with self.assertRaises(TokenError):
            open_token(t[:-2] + ("A" if t[-2] != "A" else "B") + t[-1], KEY, "synth", now=1e9)

    def test_node_vector(self):
        self.assertEqual(open_token(NODE_VECTOR, KEY, "synth", now=1e9), {"kind": "synth", "exp": 2000000000})


def segs(lines, dur=4.0):
    out, t = [], 0.0
    for _c, text in lines:
        out.append((t, t + dur, text))
        t += dur + 0.5
    return out


class PickTest(unittest.TestCase):
    def test_main_is_question_and_aux_three(self):
        r = pick(segs(SCRIPT), SCRIPT)
        self.assertTrue(r["ok"])
        self.assertEqual(r["main"]["line"], 1)
        self.assertEqual(r["main"]["text"], SCRIPT[1][1])  # R2 대본 원문
        self.assertEqual([a["line"] for a in r["aux"]], [2, 3, 4])

    def test_misread_uses_next_priority(self):
        lines = list(SCRIPT)
        bad = segs(lines)
        bad[1] = (bad[1][0], bad[1][1], "전혀 다른 말을 했습니다")
        r = pick(bad, SCRIPT)
        self.assertEqual(r["main"]["line"], 6)

    def test_too_little_speech_fails(self):
        r = pick(segs(SCRIPT[:2]), SCRIPT)
        self.assertFalse(r["ok"])

    def test_short_line_joined(self):
        s = segs(SCRIPT)
        s[1] = (s[1][0], s[1][0] + 2.0, s[1][2])  # 2초 → 다음 줄과 이어 붙임
        r = pick(s, SCRIPT)
        self.assertEqual(r["main"]["line"], 1)
        self.assertGreaterEqual(r["main"]["end"] - r["main"]["start"], 3.0)


class GenParamsTest(unittest.TestCase):
    C = {"top_k": 20, "top_p": 0.9, "temperature": 1.2}

    def test_g1_default_is_combo_c(self):  # 판정표 G1 — 운영 토큰(gen 없음) = 조합 C
        self.assertEqual(gen_params(None), self.C)
        self.assertEqual(gen_params({}), self.C)

    def test_g2_g3_override_and_clamp(self):
        self.assertEqual(gen_params({"top_k": 99, "temperature": 0, "seed": 1, "top_p": True}), {**self.C, "top_k": 50, "temperature": 0.1})
        self.assertEqual(gen_params({"top_k": 15.7, "repetition_penalty": 1.2}), {**self.C, "top_k": 15, "repetition_penalty": 1.2})

    def test_app_uses_gen_params_for_every_session(self):  # 배선 — 합성 기본 설정은 gen_params 한 곳
        src = open(os.path.join(os.path.dirname(__file__), "app.py"), encoding="utf-8").read()
        self.assertIn('**gen_params(t.get("gen"))}', src)


class BudgetTest(unittest.TestCase):
    def test_budget_and_banned(self):
        b = Budget(10, ["국민 은행"])
        self.assertIsNone(b.check("안녕"))
        self.assertEqual(b.check("국민은행 직원"), "banned")
        self.assertEqual(b.check("가" * 9), "budget")
        self.assertEqual(b.check("  "), "empty")


class NoPersistTest(unittest.TestCase):
    def test_app_has_no_volume_or_dict(self):
        """§143.7 P5 — Modal 영속 저장(Volume · Dict · Queue) 사용 0."""
        src = open(os.path.join(os.path.dirname(__file__), "app.py"), encoding="utf-8").read()
        names = {n.attr for n in ast.walk(ast.parse(src)) if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "modal"}
        self.assertFalse(names & {"Volume", "Dict", "Queue", "NetworkFileSystem", "CloudBucketMount"})


class FirstAudioTest(unittest.TestCase):  # §143.21 — 첫 음성 지연 판정표 B(서버 쪽)
    def setUp(self):
        self.src = open(os.path.join(os.path.dirname(__file__), "app.py"), encoding="utf-8").read()

    def test_b1_boot_warmup_runs_in_enter(self):  # B1 — 첫 합성 초기화를 기동 때(통화 연결 때 0)
        enter = self.src[self.src.index("def load(self)"):self.src.index("@modal.asgi_app()")]
        self.assertIn("self._boot_warmup()", enter)
        warm = self.src[self.src.index("def _boot_warmup(self)"):self.src.index("@modal.asgi_app()")]
        self.assertIn("sine=frequency", warm)  # 사람 목소리 0
        self.assertIn('self.tts.prompt_cache["ref_audio_path"] = None', warm)

    def test_b2_refs_fetched_in_parallel_and_timed(self):  # B2 — 참조 동시 받기 · 구간 로그
        ws = self.src[self.src.index('@api.websocket("/ws")'):]
        self.assertIn("asyncio.gather(*(asyncio.to_thread(_fetch", ws)
        self.assertNotIn("await asyncio.to_thread(_fetch, ref[", ws)
        self.assertIn("fetchSec=", ws)
        self.assertIn("primeSec=", ws)


if __name__ == "__main__":
    unittest.main()

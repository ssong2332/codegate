# §143.22 판정표 BS — 컨테이너 기동 단계(GPU · 모델 0 · 순수 상태). /warm이 이 단계를 돌려주고, /prepare · /ws는 ready까지 기다린다.
# | 행  | 상황                         | phase     | wait() |
# | BS1 | 기동 직후(모델 읽는 중)        | loading   | 기다림 |
# | BS2 | 모델 읽음 · 첫 합성 초기화 중  | warming   | 기다림 |
# | BS3 | 초기화 끝                     | ready     | True   |
# | BS4 | 읽기 · 초기화 중 예외          | failed    | False(즉시) |
import threading

PHASES = ("loading", "warming", "ready", "failed")


class BootState:
    def __init__(self):
        self.phase = "loading"
        self._done = threading.Event()

    def warming(self):
        self.phase = "warming"

    def ready(self):
        self.phase = "ready"
        self._done.set()

    def failed(self):
        self.phase = "failed"
        self._done.set()

    def wait(self, timeout: float) -> bool:
        """ready면 True · failed · 시간 초과면 False."""
        return self._done.wait(timeout) and self.phase == "ready"

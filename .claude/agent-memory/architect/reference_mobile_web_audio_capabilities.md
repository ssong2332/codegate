---
name: reference-mobile-web-audio-capabilities
description: 모바일 웹 출력 경로·음량·진동·자동재생·UA-CH·OS 자산 라이선스의 문서 근거 판정(2026-10-18, §73.2) — 실기 미확인 항목 구분
metadata:
  type: reference
---

2026-10-18 §73.2 판정 근거(재조사 전 출발점으로만 — 실기 확인 0회):
- 수화부↔스피커: Android는 웹 API 없음(MDN BCD `HTMLMediaElement.setSinkId` chrome_android false, crbug 41276355 · Audio Session API chrome false). iOS는 setSinkId 18.4(신뢰성 낮다는 보고) · `navigator.audioSession.type` 16.4 — 수화부/스피커 구분 근거 0(WebKit 184141·216641 NEW).
- 음량: Web Audio GainNode·ElevenLabs SDK `setVolume`은 가능, iOS `<audio>.volume`은 설정 불가(Apple 보관 문서).
- 진동: iOS Safari 미지원(BCD false), Chrome 60+ 사용자 활성화 필요.
- UA: Chrome 110+ Android UA는 `Linux; Android 10; K`로 축소 → 모델은 UA-CH `getHighEntropyValues(["model"])`(Safari·Firefox 없음). iPadOS는 Mac UA + maxTouchPoints>1.
- 자산: Apple 글꼴 라이선스가 웹 임베드 금지 명문화. SF Symbols·삼성 글꼴/벨소리는 재배포 허락 근거 0.
- 강제 다크: Chrome `color-scheme: only light`로 opt-out, 삼성 인터넷은 개발자 수단 없음(DevRel 포럼).
BCD 원본은 raw.githubusercontent.com/mdn/browser-compat-data/main/api/*.json을 WebFetch(큰 파일은 offset)로 읽으면 MDN 페이지(호환표 미포함)보다 정확하다. 관련: [[reference-gemini-live-session-constraints]]

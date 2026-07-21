# ADR-0002: 본인 목소리만 등록 강제 (OQ-U1 확정)

- Status: accepted
- Date: 2026-07-21
- Owner: architect
- DECISIONS.md entry: #4

## Context
AC-020(가드레일1)은 "사용자는 자신의 목소리만 등록할 수 있고, 타인 목소리를 무단 등록·클론하는 경로가 UI에 존재하지 않아야 한다"를 요구한다. 이는 보안 배점 20%의 핵심 근거다. UX(D-5)는 경량 자기확인(체크박스+문구, 파일 업로드 경로 UI 제거)을 제안했으나, OQ-U1은 "자기확인만으로 보안 배점 근거가 충분한지, 기술적으로 보강할 최소 장치(서버측 업로드 경로 원천 차단)가 있는지"를 architect 판단으로 남겼다. 강한 신원인증(KYC/휴대폰 본인인증)은 하루 스코프 밖(D-5)이다.

## Decision
자기확인(체크+문구)에 더해 **서버측 원천 차단**을 추가한다. 타인 음성 업로드 경로를 UI와 서버 양쪽에서 제거한다: 클라이언트는 파일 업로드 UI(`<input type="file">`·드래그드롭)를 어디에도 두지 않고 `getUserMedia`+`MediaRecorder`(마이크 캡처)만 사용한다. storage.rules가 `users/{uid}/sessions/{sid}/voice_input.*` 경로에 한해 `request.auth.uid == uid` + `contentType` `audio/*` + 크기 ≤ 3MB일 때만 쓰기를 허용하고 그 외 경로/타입/크기/타인 uid를 거부한다.

| Option | Pros | Cons |
|---|---|---|
| 자기확인 + 업로드 UI 제거 + storage.rules 서버 강제 ✅ | AC-020 의도(무단 타인 등록 차단) 충족, 서버측 원천 차단, 하루 스코프 내 | 목소리가 "실제 본인인지"까지는 검증 못 함(자기확인 수준) |
| 자기확인 체크만(D-5 원안) | 구현 최소 | 보안 배점 근거 약함(서버측 강제 부재) — OQ-U1이 지적 |
| 강한 KYC(휴대폰/정부 ID 본인인증) | 신원 확실 | 하루 개발·데모 범위 초과(D-5 rejected) |

## Consequences
- Positive: 타인 음성 무단 등록 경로가 UI에 없고, Storage 규칙이 소유자·타입·크기로 서버에서 거부하는 이중 차단. 발표에서 "타인 음성 등록 경로 부재 + 서버측 강제"를 가드레일 근거로 제시 가능.
- Negative / accepted trade-offs: 마이크로 재생된 타인 음성을 녹음하는 우회는 원천 차단이 아니다(자기확인·법적 고지로만 커버). 하루 스코프·데모 목적상 수용.
- Follow-ups required: storage.rules에 경로/소유자/contentType/size 규칙 구현(T3/T10). 클라에 파일 업로드 요소가 없는지 리뷰 체크(T11 레드팀 스팟과 함께). 본인 확인 체크 결과를 `sessions/{sid}.identitySelfConfirmed`로 로그.

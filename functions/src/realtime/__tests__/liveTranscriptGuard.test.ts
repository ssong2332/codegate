// 2026-11-07(Edge 시나리오 시험 판 3 · 16 · 23) — 실시간 통화 저장 전사 거르기: 판정표 S1 ~ S3 · U1 · U2 + 저장 정규화 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asksPasswordAloud,
  guardLiveScammerLine,
  guardLiveUserLine,
  PASSWORD_MASK,
  stripControlMarkers,
} from "../liveTranscriptGuard";
import { prepareTranscriptTurns } from "../transcriptRequest";

test("[판 23] S1 — 통화 자막의 겹대괄호 표식을 지운다(실측 문장 그대로)", () => {
  assert.equal(guardLiveScammerLine("링크 보내드릴 테니 확인 부탁드립니다. [[LINK:parcel-install]]"), "링크 보내드릴 테니 확인 부탁드립니다.");
  assert.equal(guardLiveScammerLine("상담 연결해 드릴게요. [[SIGNAL:ESCALATE_VOICE]]"), "상담 연결해 드릴게요.");
  assert.equal(guardLiveScammerLine("여기서 확인해 주세요 [[LINK:parcel-install]] 바로요"), "여기서 확인해 주세요 바로요");
  // 끼어들기로 잘린 조각 · 문자 요청 표식 · 공백 섞인 표식.
  assert.equal(stripControlMarkers("재배송은 이쪽에서요 [[LINK:parc"), "재배송은 이쪽에서요");
  assert.equal(stripControlMarkers("[[ sms : transfer ]]계좌 보내 드렸습니다"), "계좌 보내 드렸습니다");
  assert.equal(stripControlMarkers("[[LINK:a]][[SIGNAL:ESCALATE_VOICE]]"), "");
});

test("[판 16] S2 — 실존 택배사 이름을 업종 이름으로(조사 보정 포함)", () => {
  assert.equal(guardLiveScammerLine("한진택배 고객센터입니다."), "택배사 고객센터입니다.");
  assert.equal(guardLiveScammerLine("안녕하세요, 한진택배 고객센터 김민지 팀장입니다."), "안녕하세요, 택배사 고객센터 김민지 팀장입니다.");
  assert.equal(guardLiveScammerLine("CJ대한통운이요? 네 맞습니다."), "택배사요? 네 맞습니다.");
});

test("S3 — 표식 · 실명이 없으면 원문 그대로(바이트 동일 · 사칭 대상 기관 · 짧은 그룹명은 건드리지 않는다)", () => {
  for (const line of [
    "서울중앙지검 수사관 박정우입니다.",
    "금융감독원에서 확인 전화 드렸습니다.",
    "한진 쪽 물류는 아니고요, 통관 문제입니다.",
    "고객님 OTP 확인 부탁드립니다.",
    "우체국 택배로 보내시면 됩니다.",
  ]) {
    assert.equal(guardLiveScammerLine(line), line, line);
  }
});

test("[판 3] U1 — 비밀번호를 물은 바로 뒤 참가자 줄의 숫자 묶음을 가린다", () => {
  const ask = "확인을 위해 계좌 비밀번호 네 자리 말씀해 주시겠어요?";
  assert.ok(asksPasswordAloud(ask));
  assert.equal(guardLiveUserLine("일 이 삼 사", ask), PASSWORD_MASK);
  assert.equal(guardLiveUserLine("일이삼사요", ask), `${PASSWORD_MASK}요`);
  assert.equal(guardLiveUserLine("비밀번호는 1234예요", ask), `비밀번호는 ${PASSWORD_MASK}예요`);
  assert.equal(guardLiveUserLine("음 오칠 구삼이요", ask), `음 ${PASSWORD_MASK}요`);
  // 다른 묻는 말투.
  for (const q of ["비밀번호가 어떻게 되세요?", "비밀번호 확인 부탁드립니다.", "비번 불러 주세요.", "보안카드 번호 알려 주시겠어요?"]) {
    assert.ok(asksPasswordAloud(q), q);
  }
});

test("U2 — 비밀번호를 묻지 않은 뒤 · 숫자 묶음이 아닌 말은 원문 그대로", () => {
  const ask = "계좌 비밀번호 말씀해 주세요.";
  // 인증번호는 대상이 아니다(인증번호 문자 루트의 설계 단계).
  assert.equal(asksPasswordAloud("문자로 간 인증번호 여섯 자리 불러 주세요."), false);
  assert.equal(guardLiveUserLine("일 이 삼 사", "생년월일 말씀해 주세요."), "일 이 삼 사");
  assert.equal(guardLiveUserLine("1234", undefined), "1234");
  // 비밀번호 질문 뒤라도 숫자 묶음이 아니면 그대로.
  for (const line of ["이사 준비 중이라 바빠요", "그걸 왜 말해요?", "싫어요 사기 같아요", "이 이야기는 처음 들어요"]) {
    assert.equal(guardLiveUserLine(line, ask), line, line);
  }
});

test("저장 정규화 — 사기범 줄은 S1 · S2, 바로 앞 사기범이 비밀번호를 물은 참가자 줄만 U1(멱등)", () => {
  const prepared = prepareTranscriptTurns([
    { role: "scammer", text: "한진택배 고객센터입니다. 링크 확인해 주세요 [[LINK:parcel-install]]" },
    { role: "user", text: "일 이 삼 사" },
    { role: "scammer", text: "계좌 비밀번호 네 자리 말씀해 주시겠어요?" },
    { role: "user", text: "일 이 삼 사" },
    { role: "scammer", text: "네 알겠습니다." },
    { role: "user", text: `${PASSWORD_MASK}요` },
  ]);
  assert.deepEqual(
    prepared.map((t) => t.textMasked),
    ["택배사 고객센터입니다. 링크 확인해 주세요", "일 이 삼 사", "계좌 비밀번호 네 자리 말씀해 주시겠어요?", PASSWORD_MASK, "네 알겠습니다.", `${PASSWORD_MASK}요`],
  );
});

test("저장 정규화 — 표식만 있던 사기범 줄은 빈 줄로 빠진다(종전 빈 줄 제외 규칙)", () => {
  const prepared = prepareTranscriptTurns([
    { role: "scammer", text: "[[SIGNAL:ESCALATE_VOICE]]" },
    { role: "user", text: "여보세요?" },
  ]);
  assert.deepEqual(prepared.map((t) => [t.role, t.textMasked]), [["user", "여보세요?"]]);
});

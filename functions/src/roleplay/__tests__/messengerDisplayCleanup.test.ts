// PR-A3(감사 B 매트릭스 1일차 #4 · #5 · #6 · #7 · #8 · #10 · #11 · 2일차 friend-loan 존댓말 혼용) — 메신저 표시 결함 묶음.
//
// 사기범 대사 예문은 감사 원시 기록(scratchpad b-raw)의 실제 LLM 대사를 옮겼다. 각 항목마다 정탐과 오탐(건드리면 안 되는 것)을
// 같이 본다. `sendMessage` · `createSession` · `consentChallenge`는 Firestore에 묶인 onCall 핸들러라 통째로 실행하지 않고
// (scammerReplyShaping.test.ts 헤더와 같은 판단), 순수 함수는 직접 · 배선은 주석을 걷어낸 소스 스캔으로 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { dropRepeatedLinkChips } from "../linkChipRepeat";
import { extractLinkMarker } from "../linkMarker";
import { tidyScammerReplyMarkup } from "../replyMarkup";
import { SCENARIO_PROMPTS } from "../../scenarios";
import type { MessengerAttachment } from "../../shared/types";

const SRC = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

const PARCEL_CHIP: MessengerAttachment = {
  kind: "link",
  displayText: "재배송 신청 확인하기",
  fakeLandingId: "parcel-redelivery",
  harmless: true,
};
const SUBSIDY_CHIP: MessengerAttachment = {
  kind: "link",
  displayText: "지원금 신청하기",
  fakeLandingId: "subsidy-apply",
  harmless: true,
};
const HISTORY_WITH_PARCEL_CHIP = [
  { role: "scammer" as const, attachments: [PARCEL_CHIP] },
  { role: "user" as const },
];

// ── 1일차 #4 링크 칩 반복 ───────────────────────────────────────────────────────────────────────────

test("[PR-A3 #4 정탐] 이미 나온 칩을 링크를 말하지 않는 대사에 또 붙이지 않는다", () => {
  // parcel 고급 S1(실측) — 칩이 S0에 이미 있었고, 이 대사는 링크를 말하지 않는다.
  const line =
    "택배 배송 조회 건으로 연락드렸습니다. 고객님 명의로 접수된 택배가 주소지 오류로 배송 보류 상태라 확인이 필요합니다.";
  assert.equal(dropRepeatedLinkChips([PARCEL_CHIP], line, HISTORY_WITH_PARCEL_CHIP), undefined);
});

test("[PR-A3 #4 오탐] 첫 칩 · 링크를 다시 가리키는 대사 · 다른 랜딩 칩 · 칩 없는 응답은 그대로다", () => {
  // 첫 칩은 대사 내용과 무관하게 남는다(오프닝 인사여도 — 표의 한계로 고지).
  assert.deepEqual(dropRepeatedLinkChips([PARCEL_CHIP], "안녕하세요, 고객님. 배송 업무 담당자입니다.", []), [PARCEL_CHIP]);
  // 이미 나온 칩이라도 링크를 다시 가리키면 남는다(parcel 고급 S2 · S3 실측 대사).
  for (const line of [
    "정확한 확인을 위해 아래 링크에서 배송지 정보와 내역을 바로 확인 부탁드립니다.",
    "여기서 확인해 주시면 바로 배송지 오류 수정이 완료되니, 지금 바로 확인 부탁드립니다.",
    "아까 말씀드린 확인 앱을 통해 본인 확인을 하셔야 하거든요.",
  ]) {
    assert.deepEqual(dropRepeatedLinkChips([PARCEL_CHIP], line, HISTORY_WITH_PARCEL_CHIP), [PARCEL_CHIP], line);
  }
  // 칩 단위 판정 — 처음 나온 다른 랜딩 칩은 남고, 반복 칩만 빠진다(다중 마커 능력 유지 · G161).
  assert.deepEqual(
    dropRepeatedLinkChips([PARCEL_CHIP, SUBSIDY_CHIP], "다급한 상황이라 그렇습니다.", HISTORY_WITH_PARCEL_CHIP),
    [SUBSIDY_CHIP],
  );
  // 사용자 메시지의 칩(있을 수 없지만)은 "이미 나온 칩"으로 세지 않는다.
  assert.deepEqual(dropRepeatedLinkChips([PARCEL_CHIP], "다급합니다.", [{ role: "user", attachments: [PARCEL_CHIP] }]), [
    PARCEL_CHIP,
  ]);
  assert.equal(dropRepeatedLinkChips(undefined, "아래 링크", HISTORY_WITH_PARCEL_CHIP), undefined);
});

// ── 1일차 #6 · #10 마커 자리 잔재 ───────────────────────────────────────────────────────────────────

test("[PR-A3 #6 · #10 정탐] 마커 자리의 빈 백틱과 조사 앞 공백을 지운다", () => {
  const parcel = { difficultyLevel: "intermediate" as const };
  assert.equal(
    extractLinkMarker("아까 보내드린 링크 [[LINK:parcel-redelivery]]에 접속해서 확인해 주세요.", "messenger-parcel-smishing-sms", parcel)
      .text,
    "아까 보내드린 링크에 접속해서 확인해 주세요.",
  );
  assert.equal(
    extractLinkMarker("여기 안내드리는 `[[LINK:subsidy-install]]` 주소로 접속하셔서 확인 앱부터 설치해 주세요.", "messenger-subsidy-smishing-sms")
      .text,
    "여기 안내드리는 주소로 접속하셔서 확인 앱부터 설치해 주세요.",
  );
  assert.equal(
    extractLinkMarker("링크 `[[LINK:subsidy-install]]`를 눌러 주세요.", "messenger-subsidy-smishing-sms").text,
    "링크를 눌러 주세요.",
  );
});

test("[PR-A3 #6 · #10 오탐] 마커가 없던 자리의 백틱 · 띄어쓰기와 문장 끝 마커 정리는 종전 그대로다", () => {
  // 마커 뒤가 공백이면 마커 앞 공백을 지우지 않는다(종전 연속 공백 정리만).
  assert.equal(
    extractLinkMarker("여기서 확인해 주세요 [[LINK:parcel-redelivery]] 감사합니다.", "messenger-parcel-smishing-sms").text,
    "여기서 확인해 주세요 감사합니다.",
  );
  assert.equal(
    extractLinkMarker("여기서 확인해 주세요 [[LINK:parcel-redelivery]].", "messenger-parcel-smishing-sms").text,
    "여기서 확인해 주세요.",
  );
  // 마커와 떨어진 백틱 · "공백+조사꼴"은 이 단계가 건드리지 않는다.
  assert.equal(
    extractLinkMarker("코드 `ABC` 에 있어요 [[LINK:parcel-redelivery]].", "messenger-parcel-smishing-sms").text,
    "코드 `ABC` 에 있어요.",
  );
  // 반환 텍스트에 자리 표식(제어 문자)이 새지 않는다.
  const result = extractLinkMarker("`[[LINK:parcel-redelivery]]`[[LINK:parcel-redelivery]]확인", "messenger-parcel-smishing-sms");
  assert.equal(result.text.includes("\u0000"), false);
  assert.equal(result.attachments?.length, 2, "다중 마커는 그대로 2개(G161)");
});

// ── 1일차 #5 · #6 · #8 모델 표기 잔재 ───────────────────────────────────────────────────────────────

test("[PR-A3 #5 · #6 · #8 정탐] 굵게 별표 · 빈 백틱 · 지문 괄호를 지운다(실측 대사)", () => {
  assert.equal(
    tidyScammerReplyMarkup("너 지금 쓰는 계좌의 **비밀번호 4자리**만 채팅으로 살짝 적어줄 수 있어?").text,
    "너 지금 쓰는 계좌의 비밀번호 4자리만 채팅으로 살짝 적어줄 수 있어?",
  );
  assert.equal(
    tidyScammerReplyMarkup("여기 안내드리는 `` 주소로 접속하셔서 확인 앱부터 설치해 주세요.").text,
    "여기 안내드리는 주소로 접속하셔서 확인 앱부터 설치해 주세요.",
  );
  assert.equal(
    tidyScammerReplyMarkup("지금 통화 연결해 드릴 테니 잠시만 기다려 주세요. \n\n(잠시 후) 여보세요?").text,
    "지금 통화 연결해 드릴 테니 잠시만 기다려 주세요.\n\n여보세요?",
  );
  assert.equal(tidyScammerReplyMarkup("(한숨) 엄마, 나 진짜 급해.").text, "엄마, 나 진짜 급해.");
  assert.equal(tidyScammerReplyMarkup("**지금** 바로 **확인**해 주세요.").removedCount, 2);
});

test("[PR-A3 #5 · #6 · #8 오탐] 일반 괄호 · 짝 없는 별표 · 코드 펜스 · 정상 대사는 그대로다(바이트 동일)", () => {
  const untouched = [
    "(주)한결캐피탈 상담원입니다.",
    "대표번호(1588-0000)로 확인해 보셔도 됩니다.",
    "3*4=12처럼 간단해요. *참고*로 말씀드려요.",
    "```",
    "잠시만 기다려 주세요. 곧 연결해 드릴게요.",
    "  앞뒤 공백도  그대로  ",
    "(가상) 안내 문자입니다.",
  ];
  for (const line of untouched) {
    const result = tidyScammerReplyMarkup(line);
    assert.equal(result.text, line, line);
    assert.equal(result.removedCount, 0, line);
  }
});

// ── 배선(소스 스캔) ─────────────────────────────────────────────────────────────────────────────────

/** sendMessage 배선 판정식 — 토큰이 각 1번씩 있고 순서가 맞으며 저장 · 응답은 정리된 칩만 쓴다. */
function sendMessageWiringOk(code: string): boolean {
  const at = (token: string) => {
    const index = code.indexOf(token);
    return index >= 0 && code.indexOf(token, index + 1) === -1 ? index : -1;
  };
  const link = at("extractLinkMarker(");
  const drop = at("dropRepeatedLinkChips(markerAttachments, linkFreeReplyText, storedHistory)");
  const signal = at("extractEscalationSignal(smsMarkerFreeText)");
  const tidy = at("tidyScammerReplyMarkup(signalFreeReplyText)");
  const realName = at("replaceRealFinancialNames(markupFreeReplyText)");
  if ([link, drop, signal, tidy, realName].some((index) => index < 0)) return false;
  if (!(link < drop && signal < tidy && tidy < realName)) return false;
  // 저장 · 응답은 정리된 칩(replyAttachments)만 쓴다 — 추출 원본(markerAttachments)은 선언 1 + 정리 입력 1뿐이다.
  return (
    (code.match(/markerAttachments/g) ?? []).length === 2 &&
    (code.match(/attachments: replyAttachments/g) ?? []).length === 2
  );
}

test("[PR-A3 배선] sendMessage — 칩 반복 정리는 마커 추출 뒤 · 저장 앞, 표기 정리는 신호 추출 뒤 · 실존명 치환 앞이다", () => {
  const code = codeOnly(SRC("roleplay/index.ts"));
  assert.equal(sendMessageWiringOk(code), true);
  // 역검증 — 오염본 3종을 같은 판정식이 잡는다: ① 칩 정리를 뺌 ② 표기 정리를 실존명 치환 뒤로 ③ 저장이 추출 원본을 씀.
  const tainted = [
    code.replace("dropRepeatedLinkChips(markerAttachments, linkFreeReplyText, storedHistory)", "markerAttachments"),
    code
      .replace("tidyScammerReplyMarkup(signalFreeReplyText)", "__TIDY__")
      .replace("replaceRealFinancialNames(markupFreeReplyText)", "tidyScammerReplyMarkup(signalFreeReplyText)")
      .replace("__TIDY__", "replaceRealFinancialNames(markupFreeReplyText)"),
    code.replace("attachments: replyAttachments", "attachments: markerAttachments"),
  ];
  tainted.forEach((variant, index) => assert.equal(sendMessageWiringOk(variant), false, `오염본 ${index + 1}`));
});

test("[PR-A3 배선] 오프닝 — 표기 정리는 링크 추출 뒤 · 실존명 치환 앞이다", () => {
  const code = codeOnly(SRC("roleplay/openingLine.ts"));
  const link = code.indexOf("extractLinkMarker(completion.text, scenarioId, sessionView)");
  // §122(7) — 링크 추출과 표기 정리 사이에 문자 · 신호 마커 제거가 들어갔다(정리 입력 = 신호 제거 결과).
  const tidy = code.indexOf("tidyScammerReplyMarkup(signalFreeText)");
  const realName = code.indexOf("replaceRealFinancialNames(markupFreeText)");
  assert.ok(link >= 0 && tidy > link && realName > tidy, `${link} < ${tidy} < ${realName}`);
});

// ── 1일차 #11 오프닝 링크 칩 저장 ────────────────────────────────────────────────────────────────────

test("[PR-A3 #11] 오프닝 메시지 저장(createSession · 챌린지 수신자)이 오프닝 칩을 함께 쓴다", () => {
  const pattern = /textMasked: openingMessage\.text,\n\s*turnIndex: 0,\n\s*createdAt: now,\n\s*\.\.\.\(openingMessage\.attachments \? \{ attachments: openingMessage\.attachments \} : \{\}\),/;
  for (const rel of ["session/index.ts", "challenge/userAccess.ts"]) {
    const code = codeOnly(SRC(rel));
    assert.match(code, pattern, rel);
    // 역검증 — 칩 줄을 지운 오염본(=수정 전 코드)은 같은 판정식에 걸리지 않는다.
    const tainted = code.replace(/\n\s*\.\.\.\(openingMessage\.attachments \? \{ attachments: openingMessage\.attachments \} : \{\}\),/, "");
    assert.doesNotMatch(tainted, pattern, `${rel} 역검증`);
  }
});

// ── 1일차 #7 성별 얼버무림 · 2일차 friend-loan 존댓말 혼용(프롬프트 줄) ─────────────────────────────

test("[PR-A3 #7 · 존댓말 혼용] child-kakao는 성별 얼버무림 금지, friend-loan은 반말 유지 줄을 갖는다(다른 시나리오 무변경)", () => {
  const child = SCENARIO_PROMPTS["messenger-child-impersonation-kakao"].personaPrompt;
  const friend = SCENARIO_PROMPTS["messenger-friend-loan-kakao"].personaPrompt;
  assert.match(child, /"아들\/딸"처럼 두 성별을 빗금으로 나란히 쓰지 않고/);
  assert.match(friend, /처음부터 끝까지 친구끼리의 반말을 유지한다/);
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    if (scenarioId !== "messenger-child-impersonation-kakao") {
      assert.equal(prompt.personaPrompt.includes("빗금으로 나란히"), false, scenarioId);
    }
    if (scenarioId !== "messenger-friend-loan-kakao") {
      assert.equal(prompt.personaPrompt.includes("친구끼리의 반말"), false, scenarioId);
    }
  }
});

// ── 리뷰 Minor 1 · 2 ─────────────────────────────────────────────────────────────────────────────

test("[PR-A3 리뷰 Minor 1] 지문 어휘 바로 뒤가 ) · 공백 · 쉼표 · 말줄임일 때만 지운다 — 같은 어휘로 시작하는 대사 괄호는 남긴다", () => {
  for (const line of ["(잠시만요 고객님) 바로 확인해 드릴게요.", "(침묵을 지켜 주세요) 중요한 내용입니다.", "(한숨이 나오시죠) 이해합니다."]) {
    const result = tidyScammerReplyMarkup(line);
    assert.equal(result.text, line, line);
    assert.equal(result.removedCount, 0, line);
  }
  // 정탐 회귀 — 어휘 뒤가 ) · 공백 · 쉼표 · 말줄임이면 지운다.
  assert.equal(tidyScammerReplyMarkup("(잠시 후) 여보세요?").text, "여보세요?");
  assert.equal(tidyScammerReplyMarkup("(한숨 쉬며) 엄마, 나 급해.").text, "엄마, 나 급해.");
  assert.equal(tidyScammerReplyMarkup("(침묵, 잠시) 네, 들립니다.").text, "네, 들립니다.");
  assert.equal(tidyScammerReplyMarkup("(침묵…) 네, 들립니다.").text, "네, 들립니다.");
});

test("[PR-A3 리뷰 Minor 2] 마커 앞 공백은 마커 뒤가 조사일 때만 지운다 — 조사가 아닌 한글이 붙으면 띄어쓰기를 남긴다", () => {
  const scenario = "messenger-parcel-smishing-sms";
  assert.equal(extractLinkMarker("아래 [[LINK:parcel-redelivery]]확인해 주세요.", scenario).text, "아래 확인해 주세요.");
  assert.equal(extractLinkMarker("링크 [[LINK:parcel-redelivery]]이용 안내입니다.", scenario).text, "링크 이용 안내입니다.");
  // 정탐 회귀 — 조사 목록.
  for (const [particle, rest] of [["에", " 접속"], ["에서", " 확인"], ["로", " 들어가"], ["으로", " 들어가"], ["를", " 눌러"], ["의", " 안내"]] as const) {
    assert.equal(
      extractLinkMarker(`링크 [[LINK:parcel-redelivery]]${particle}${rest} 주세요.`, scenario).text,
      `링크${particle}${rest} 주세요.`,
      particle,
    );
  }
});

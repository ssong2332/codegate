// ⭐ 실기기 확인(2026-11-01 · #454 배포 뒤) 현실 차이 작은 것 3건 — 메인 "권고 순서대로".
// | # | 실기기에서 본 것 | 고정하는 것 |
// |---|---|---|
// | S1 | 카드 이관 문자 예금주 = "카드피해대응지원센터"(기관 명의) | 계좌 문자 예금주 전부 = 가상 개인 이름(기관 · 센터형 0) · 사기범 둘러대기 1문장 · fv-akj5 문자 선언 0 그대로 |
// | S2 | 지인 사칭 첫 메시지 아래 "송금하기" 칩(계좌 전) | 이체 화면 칩은 계좌가 대화에 나온 뒤에만(판정표 P1~P4) · 칩이 생기는 5경로 배선 |
// | S3 | 같은 번호 문자방 제목이 두 번째 문자부터 "메시지" | 화면 쪽(`src/lib/incallsms/inCallSms.test.ts` S3) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { IN_CALL_SMS } from "../inCallSms";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../flowVariants";
import { extractAccountHolder } from "../../shared/fictionalBank";
import { buildSystemPrompt, HOLDER_EXCUSE_SENTENCE, TRANSFER_VIA_LINK_ONLY_SENTENCE } from "../../roleplay/promptAssembly";
import { sessionDeclaredSmsPurposes, sessionDeclaresInCallSms, sessionTransferSmsOpensLanding } from "../../inCallSms/smsGate";
import { dropPrematureBankTransferChip } from "../../roleplay/linkMarker";
import type { MessengerAttachment } from "../../shared/types";

const SRC = path.resolve(__dirname, "../../../src/roleplay");
const read = (file: string) => readFileSync(path.join(SRC, file), "utf8").replace(/\r\n/g, "\n");

test("[S1] 계좌 문자 예금주 = 가상 개인 이름(한글 2~4자) · 기관 · 센터형 0 · 서로 다름", () => {
  const holders = Object.values(IN_CALL_SMS)
    .flat()
    .map((item) => [item.smsId, extractAccountHolder(item.body)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined);
  assert.ok(holders.length >= 9, `계좌 문자 수 ${holders.length}`);
  for (const [smsId, name] of holders) {
    assert.match(name, /^[가-힣]{2,4}$/, `${smsId}: ${name}`);
    assert.equal(/센터|관리|캐피탈|공탁|보호|대응|통관|○/.test(name), false, `${smsId}: 기관형 ${name}`);
  }
  // 같은 계좌번호를 쓰는 문자끼리가 아니면 예금주 이름이 겹치지 않는다(한 대화에서 두 사람 이름이 섞이지 않게 — 시나리오마다 하나).
  assert.equal(new Set(holders.map(([, name]) => name)).size, holders.length, holders.map(([, n]) => n).join(","));
  assert.equal(findFlowVariant("fv-akj5")?.sms.length ?? 0, 0, "fv-akj5(#192) 문자 선언 0 그대로");
});

test("[S1] 사기범 둘러대기 — 이체 링크 문자 세션 공통 1문장 · 카드 고급 fv-x7ue 조립에 실림", () => {
  assert.ok(TRANSFER_VIA_LINK_ONLY_SENTENCE.endsWith(HOLDER_EXCUSE_SENTENCE));
  assert.ok(HOLDER_EXCUSE_SENTENCE.includes("담당자 명의로 관리하는 계좌"));
  assert.ok(HOLDER_EXCUSE_SENTENCE.includes("다른 예금주를 지어내지 않는다"));
  const S = "card-company-impersonation";
  const V = "fv-x7ue";
  const prompt = buildSystemPrompt(resolveSessionScenarioPrompt(S, V)!, {
    difficultyLevel: "advanced",
    inCallSmsEnabled: sessionDeclaresInCallSms(S, V),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(S, V),
    transferSmsLink: sessionTransferSmsOpensLanding(S, V),
  });
  assert.ok(prompt.includes(HOLDER_EXCUSE_SENTENCE.trim()));
});

test("[S2] 이체 화면 칩은 계좌가 대화에 나온 뒤에만 — 판정표 P1~P4", () => {
  const chip: MessengerAttachment = { kind: "link", displayText: "송금하기", fakeLandingId: "friend-bank-transfer", harmless: true };
  const other: MessengerAttachment = { kind: "link", displayText: "보험 접수 앱 설치하기", fakeLandingId: "child-insurance-install", harmless: true };
  const account = "948-2716-5093-27";
  assert.equal(dropPrematureBankTransferChip(undefined, "안녕", account, []), undefined, "P1 첨부 없음");
  assert.deepEqual(dropPrematureBankTransferChip([other], "이거 깔아 줘", account, []), [other], "P1 이체 칩 아님");
  assert.deepEqual(dropPrematureBankTransferChip([chip], "계좌는 한결은행 948-2716-5093-27이야", account, []), [chip], "P2 이번 대사");
  assert.deepEqual(dropPrematureBankTransferChip([chip], "9482716509327 여기로 보내 줘", account, []), [chip], "P2 하이픈 없이 말해도");
  assert.deepEqual(dropPrematureBankTransferChip([chip], "여기로 보내 줘", account, [{ role: "scammer", textMasked: "한결은행 948-2716-5093-27" }]), [chip], "P3 앞선 대사");
  assert.equal(dropPrematureBankTransferChip([chip], "잘 지냈어? 부탁 하나만 하자", account, []), undefined, "P4 첫 메시지");
  assert.equal(dropPrematureBankTransferChip([chip], "보내 줘", account, [{ role: "user", textMasked: "948-2716-5093-27?" }]), undefined, "P4 참가자 말은 세지 않는다");
  assert.deepEqual(dropPrematureBankTransferChip([other, chip], "이것도 해 줘", account, []), [other], "P4 다른 칩은 남는다");
});

test("[S2 배선] 칩이 생기는 5경로 — 오프닝 · sendMessage · 통화 중 카톡 · 화면 행동 뒤 · 통화 복귀", () => {
  const opening = read("openingLine.ts");
  assert.ok(opening.includes("const attachments = dropPrematureBankTransferChip(markerAttachments, linkFreeText, resolveRouteAccountNumber(scenarioId, flowVariantId), []);"));
  const index = read("index.ts");
  assert.ok(index.includes("ensureBankTransferChip(\n        // S2"), "보충(D-g) 앞에서 뺀다 — 계좌를 말하면 보충이 다시 붙인다");
  assert.ok(index.includes("dropPrematureBankTransferChip(\n          dropRepeatedLinkChips(markerAttachments, linkFreeReplyText, storedHistory),\n          linkFreeReplyText,\n          routeAccountNumber,\n          storedHistory,\n        ),"));
  for (const [file, historyVar] of [["chatDuringCall.ts", "claim.history"], ["screenActionFollowUp.ts", "history"]] as const) {
    const src = read(file);
    assert.ok(src.includes(`dropRepeatedLinkChips(markerAttachments, linkFreeText, ${historyVar}),`), file);
    assert.ok(src.includes(`resolveRouteAccountNumber(session.scenarioId, session.flowVariantId),\n${file === "chatDuringCall.ts" ? "    " : "      "}${historyVar},`), file);
  }
  assert.ok(read("callReturnLine.ts").includes("dropPrematureBankTransferChip(markerAttachments, linkFreeText, resolveRouteAccountNumber(session.scenarioId, session.flowVariantId), history);"));
});

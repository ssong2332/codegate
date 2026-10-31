// ⭐ D-e(P2 실 키 실측 2026-11-01 · 메인 "권고대로") — 메신저 "이체 완료 화면 캡처" 보내기(서비스 안 · 네트워크 0).
// | # | 고정하는 것 |
// |---|---|
// | R1 | 캡처 이미지 = 서버가 칩에 실은 값(은행 · 계좌 · 받는 분)과 시각만 — 입력 금액 0(G138) · 실존 은행명 0 |
// | R2 | 캡처는 이 대화방에서 훈련용 이체 화면을 제출한 뒤에만 '+'에 생긴다(칩에 은행 · 계좌가 실린 랜딩 제출) |
// | R3 | 캡처를 보내면 사진 턴 + `photoKind: "transfer-receipt"` · 이미지는 data URL(기기 메모리)뿐 — 업로드 0 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { receiptTimeLabel, transferReceiptDataUrl, transferReceiptSvg } from "./transferReceipt.ts";

const room = readFileSync("src/components/MessengerChatRoom.tsx", "utf8");

test("[D-e R1] 캡처 SVG — 은행 · 받는 계좌 · 받는 분 · 시각 · 완료 문구 · 금액 칸 0 · 특수문자 이스케이프", () => {
  const svg = transferReceiptSvg({ bankName: "가온은행", accountNumber: "948-2716-5093-27", holder: "김도현" }, new Date(2026, 10, 1, 14, 5));
  for (const text of ["가온은행 모바일뱅킹", "이체가 완료되었습니다", "받는 분", "김도현", "가온은행 948-2716-5093-27", "2026.11.01 14:05"]) assert.ok(svg.includes(text), text);
  assert.equal(/금액|원</.test(svg), false, "입력 금액을 싣지 않는다(G138)");
  assert.ok(transferReceiptSvg({ bankName: "<b>", accountNumber: "1" }, new Date(0)).includes("&#60;b&#62;"));
  assert.equal(transferReceiptSvg({ bankName: "가온은행", accountNumber: "1" }, new Date(0)).includes("받는 분"), false, "받는 분을 모르면 그 줄 0");
  assert.ok(transferReceiptDataUrl({ bankName: "가온은행", accountNumber: "1" }, new Date(0)).startsWith("data:image/svg+xml"));
  assert.equal(receiptTimeLabel(new Date(2026, 0, 2, 3, 4)), "2026.01.02 03:04");
});

test("[D-e R2 · R3] 대화방 — 이체 화면 제출 뒤에만 캡처 · '+'는 캡처가 있으면 고르기 시트 · 사진 턴 종류 전달 · 업로드 0", () => {
  assert.ok(room.includes("if (fakeLanding.bankName && fakeLanding.accountNumber) {\n              setTransferReceipt({"), "칩에 은행 · 계좌가 실린 랜딩 제출 뒤");
  assert.ok(room.includes("onClick={() => (transferReceipt ? setPlusSheetOpen(true) : photoInputRef.current?.click())}"));
  assert.ok(room.includes('void handleSend(undefined, url, "transfer-receipt");'));
  assert.ok(room.includes("...(photoUrl && photoKind ? { photoKind } : {}),"), "사진 턴 종류를 서버로");
  assert.ok(room.includes("앨범에서 선택"), "기기 사진 고르기는 그대로 남는다");
  assert.equal(/uploadBytes|getStorage|fetch\(/.test(readFileSync("src/lib/messenger/transferReceipt.ts", "utf8")), false, "네트워크 0");
});

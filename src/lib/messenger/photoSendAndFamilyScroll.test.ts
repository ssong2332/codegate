// §113(실기 신고 7 · 9 — 2026-10-23) — 호칭 선택 뒤 자동 스크롤 · 대화방 사진 보내기(기기 사진 · 화면 메모리만) 배선 고정.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("[§113.1] 난이도 화면 — 호칭 칸이 있으면 그 칸을 기준으로 시트 위로 내린다 · 호칭을 골라도 다시 잰다", () => {
  const src = read("src/app/scenarios/difficulty/page.tsx");
  assert.match(src, /document\.querySelector<HTMLElement>\("\[data-family-address\]"\) \?\?\s*document\.querySelector<HTMLElement>\(`\[data-panel-key="\$\{selected\}"\]`\)/);
  assert.match(src, /\}, \[selected, startError, familyAddress\]\);/);
  assert.match(src, /<fieldset data-family-address /);
});

test("[§113.2] 대화방 사진 — 기기 사진(accept image/*) · objectURL만 · 서버엔 photo 사실만 · 화면을 떠나면 revoke · 안내 문구 0", () => {
  const src = read("src/components/MessengerChatRoom.tsx");
  assert.match(src, /type="file"\s*accept="image\/\*"/);
  assert.match(src, /const url = URL\.createObjectURL\(file\);/);
  assert.match(src, /for \(const url of urls\) URL\.revokeObjectURL\(url\);/);
  // §121.7 — 통화 중 대화방이면 `duringCall`이 더 붙는다(사진은 여전히 사실만 · 글자 0).
  assert.match(src, /userText: photoUrl \? "" : text,\n\s*\.\.\.\(photoUrl \? \{ photo: true \} : \{\}\),/);
  // ⛔ 업로드 경로 0 — Storage · FormData · 파일 내용 읽기가 이 화면에 없다.
  assert.equal(/firebase\/storage|uploadBytes|FormData|FileReader|readAsDataURL|arrayBuffer\(\)/.test(src), false);
  assert.match(src, /aria-label="사진 보내기"/);
  // 사진 말풍선(카톡형 · 문자형 둘 다).
  assert.equal((src.match(/<PhotoBubble url=\{message\.photoUrl \?\? photoUrls\[message\.turnIndex\]\} \/>/g) ?? []).length, 2);
  // 안내 문구(저장하지 않습니다 · 모의 등) 0.
  assert.equal(/저장하지 않|업로드하지 않|실제 사진은/.test(src), false);
});

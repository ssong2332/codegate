// 카카오톡·SNS 공유 미리보기 이미지(public/og-image.png, 1200×630)를 만든다 — 시안 A(공공 안심형) 색.
// 색 값은 src/app/globals.css :root 토큰과 같다(page · surface · ink · ink-sub · brand · brand-tint · line).
// 글꼴은 이 PC에 설치된 한글 글꼴(맑은 고딕 등)로 래스터화된다 — 다시 만들면 글꼴에 따라 모양이 조금 달라질 수 있다.
// 실행: node scripts/generate-og-image.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../public/og-image.png", import.meta.url));
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f5f7fa"/>
  <rect x="0" y="0" width="1200" height="12" fill="#1b4b8a"/>
  <g transform="translate(80 92) scale(2.6)" fill="none" stroke="#1b4b8a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5"/>
  </g>
  <text x="160" y="140" font-family="${FONT}" font-size="34" font-weight="700" fill="#142235">금융사기 예방 훈련</text>
  <text x="80" y="290" font-family="${FONT}" font-size="76" font-weight="700" fill="#142235">사기 전화, 미리 한 번</text>
  <text x="80" y="385" font-family="${FONT}" font-size="76" font-weight="700" fill="#1b4b8a">받아 보세요</text>
  <text x="80" y="465" font-family="${FONT}" font-size="34" fill="#4a5868">AI 사기범과 앱 안에서 연습하고, 가족에게도 훈련을 보내 보세요</text>
  <rect x="80" y="515" width="470" height="56" rx="28" fill="#e6eef8"/>
  <text x="315" y="553" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="#1b4b8a">연습용 · 실제 돈은 오가지 않습니다</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`wrote ${out}`);

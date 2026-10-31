// ⭐ D-e(P2 실 키 실측 2026-11-01 · 메인 "권고대로") — 메신저 사기범의 "이체 완료 화면 캡처해서 보내줘"(실제 수법)를 서비스 안에서 하게 하는
// **앱이 만든 이체 완료 화면 캡처** 이미지(순수 함수 · 잎 모듈).
//
// | 항목 | 정책 |
// |---|---|
// | 언제 생기나 | 이 대화방에서 훈련용 이체 화면(칩)을 **제출한 뒤**에만 '+' 시트에 나온다(실제로도 이체한 뒤에야 완료 화면 캡처가 앨범에 있다) |
// | 담는 값 | 세션 가상 은행명 · 받는 계좌 · 받는 분(변형 가상 예금주) · 캡처 시각 — **서버가 칩에 실은 값만** |
// | 담지 않는 값 | 참가자가 화면에 넣은 금액 · 입력값(G138 — 이체 화면 입력값은 그 화면 밖으로 나가지 않는다). 금액 칸은 "확인됨"으로만 |
// | 어디에 있나 | 기기 메모리(data URL)뿐 — 서버 업로드 · Storage · Firestore · 로그 0(§113.2 사진 정책과 같다). 서버에는 "캡처를 보냈다"는 사실만 간다 |
// | 실존 표기 | 실존 은행명 · 로고 0(가상 은행명 §81) |

export type TransferReceiptSource = {
  bankName: string;
  accountNumber: string;
  holder?: string;
};

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 캡처 시각 표기("2026.11.01 14:05") — 기기 시계. */
export function receiptTimeLabel(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}.${pad(at.getMonth() + 1)}.${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** 이체 완료 화면 캡처 SVG(문자열). 휴대폰 화면 비율(9:16)의 단순한 은행 앱 완료 화면. */
export function transferReceiptSvg(source: TransferReceiptSource, at: Date): string {
  const rows: [string, string][] = [
    ...(source.holder ? [["받는 분", source.holder] as [string, string]] : []),
    ["받는 계좌", `${source.bankName} ${source.accountNumber}`],
    ["이체 결과", "정상 처리"],
    ["처리 시각", receiptTimeLabel(at)],
  ];
  const rowSvg = rows
    .map(
      ([label, value], i) =>
        `<text x="40" y="${520 + i * 64}" font-size="26" fill="#6b7280">${escapeXml(label)}</text>` +
        `<text x="680" y="${520 + i * 64}" font-size="26" fill="#111827" text-anchor="end" font-weight="600">${escapeXml(value)}</text>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280" font-family="system-ui, sans-serif">` +
    `<rect width="720" height="1280" fill="#f9fafb"/>` +
    `<rect width="720" height="120" fill="#1e3a5f"/>` +
    `<text x="40" y="76" font-size="32" fill="#ffffff" font-weight="700">${escapeXml(source.bankName)} 모바일뱅킹</text>` +
    `<circle cx="360" cy="300" r="64" fill="#2563eb"/>` +
    `<path d="M328 300 l22 22 l44 -46" stroke="#ffffff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="360" y="420" font-size="36" fill="#111827" text-anchor="middle" font-weight="700">이체가 완료되었습니다</text>` +
    rowSvg +
    `<rect x="40" y="1120" width="640" height="88" rx="16" fill="#1e3a5f"/>` +
    `<text x="360" y="1176" font-size="28" fill="#ffffff" text-anchor="middle" font-weight="600">확인</text>` +
    `</svg>`
  );
}

/** `<img src>`에 바로 쓰는 data URL(기기 메모리 · 네트워크 0). */
export function transferReceiptDataUrl(source: TransferReceiptSource, at: Date): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(transferReceiptSvg(source, at))}`;
}

// 2026-10-27(사용자 요청 — 갤럭시 One UI 9 실기 통화 화면 재현) — 이름 아래 작은 부제(실기 = 연락처 번호 종류 "폰").
// 우리 앱 발신자는 연락처가 아니라 번호다 — 번호 모양으로 종류만 붙인다(추정 근사 · 실기는 저장 안 된 번호에 다른 표기를 쓸 수 있다).
// 잎(leaf) 모듈 — import 0.

/** 010 · 011 · 016~019 = "휴대전화" · 지역번호 · 070 · 15xx/16xx/18xx 대표번호 = "전화" · 그 밖(표시제한 등) = null(부제 없음). */
export function oneUi9CallerSubtitle(label: string): string | null {
  const digits = label.replace(/[\s-]/g, "");
  if (/^01[016789]\d{7,8}$/.test(digits)) return "휴대전화";
  if (/^0(2|[3-6]\d|70)\d{7,8}$/.test(digits) || /^1[568]\d{6}$/.test(digits)) return "전화";
  return null;
}

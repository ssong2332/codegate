// Firestore 시딩 스크립트(T6) — `scenarios/{id}`(공개 메타) + `scenarioPrompts/{id}`(민감 프롬프트,
// 클라 read 거부)를 firebase-admin으로 주입한다. Database.md §Migration Policy: "scenarios/
// scenarioPrompts seed는 배포 스크립트로 주입"을 구현한 것.
//
// 실행 전제: `firebase login` + `firebase use --add`로 실제 Firebase 프로젝트가 `.firebaserc`에
// 연결되어 있어야 한다(README.md "Firebase 프로젝트 연결" 참조). 프로젝트가 아직 없으면(콘솔에서
// 미생성) 이 스크립트는 인증/프로젝트 조회 단계에서 실패한다 — 실패 자체가 정상이며, 프로젝트
// 연결 후 재실행하면 된다.
//
// 실행 방법: `functions/`에서
//   npm run build
//   npm run seed:scenarios
// (Application Default Credentials를 사용한다 — 로컬에서는 `firebase login`으로 얻은 gcloud/
// firebase CLI 자격 증명을, 배포 환경에서는 서비스 계정 기본 자격 증명을 사용한다.)
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { SCENARIO_PROMPTS } from "./index";
import { PUBLIC_SCENARIOS } from "./publicMeta";

async function main(): Promise<void> {
  initializeApp();
  const db = getFirestore();

  const scenarioIds = Object.keys(PUBLIC_SCENARIOS);
  const promptIds = Object.keys(SCENARIO_PROMPTS);
  const missingPrompts = scenarioIds.filter((id) => !promptIds.includes(id));
  if (missingPrompts.length > 0) {
    throw new Error(
      `scenarioPrompts가 누락된 scenarioId가 있습니다(1:1 매핑 필요, Database.md): ${missingPrompts.join(", ")}`,
    );
  }

  const batch = db.batch();
  for (const [id, doc] of Object.entries(PUBLIC_SCENARIOS)) {
    batch.set(db.collection("scenarios").doc(id), doc);
  }
  for (const [id, doc] of Object.entries(SCENARIO_PROMPTS)) {
    batch.set(db.collection("scenarioPrompts").doc(id), doc);
  }
  await batch.commit();

  console.log(
    `Seeded ${scenarioIds.length} scenario(s) into scenarios/ + scenarioPrompts/: ${scenarioIds.join(", ")}`,
  );
}

main().catch((err) => {
  console.error("시나리오 시딩 실패:", err);
  process.exitCode = 1;
});

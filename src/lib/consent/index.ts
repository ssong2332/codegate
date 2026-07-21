// 동의 로그 write/read — UX-001 사전고지+동의 게이팅 (Track C, T3, AC-012/AC-017).
// Database.md `users/{uid}/consents/{consentId}` 1:1. firestore.rules는 request.auth.uid == uid만
// read/write를 허용하므로(본인 계정 귀속) Functions 경유 없이 클라 직접 write로 충분하다
// (userProfile.ts의 `users/{uid}` 클라 직접 write와 동일한 판단).
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// 동의 문구가 바뀌면 이 버전을 올린다(Database.md consentTextVersion — "추후 문구 변경 추적").
export const CONSENT_TEXT_VERSION = "v1";

export async function grantConsent(uid: string): Promise<void> {
  await addDoc(collection(db, "users", uid, "consents"), {
    granted: true,
    grantedAt: serverTimestamp(),
    consentTextVersion: CONSENT_TEXT_VERSION,
  });
}

// AC-017 게이팅에 사용 — 온보딩 이후 화면(녹음 등)이 진입 전 동의 여부를 확인할 때 재사용.
export async function hasGrantedConsent(uid: string): Promise<boolean> {
  const consentsQuery = query(
    collection(db, "users", uid, "consents"),
    where("granted", "==", true),
    limit(1),
  );
  const snapshot = await getDocs(consentsQuery);
  return !snapshot.empty;
}

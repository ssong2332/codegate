// 연령 확인 기록 read/write (Track C, T14, UX-011, AC-014, Database.md `users/{uid}.ageVerified`).
// firestore.rules상 `users/{uid}`는 request.auth.uid == uid만 read/write 가능한 본인 귀속
// 최상위 문서라(consent/index.ts·userProfile.ts와 동일 판단), Functions 경유 없이 클라 직접
// Firestore SDK로 read/write한다.
import { doc, getDoc, setDoc, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";

type UserProfileDoc = DocumentData & { ageVerified?: boolean };

/** 이미 연령 확인을 통과한 사용자인지 조회(재방문 시 재질문 방지). */
export async function hasVerifiedAge(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return false;
  const data = snap.data() as UserProfileDoc;
  return data.ageVerified === true;
}

/** 통과 기록 — `users/{uid}.ageVerified = true` (Database.md, 다른 프로필 필드는 건드리지 않는다). */
export async function verifyAge(uid: string): Promise<void> {
  await setDoc(doc(db, "users", uid), { ageVerified: true }, { merge: true });
}

// users/{uid} 프로필 upsert (Track C, T18, UX-013 · AC-027 · Database.md `users/{uid}`).
// 최초 로그인 시 문서를 생성(createdAt 포함)하고, 이후 로그인마다 lastLoginAt만 갱신한다.
// firestore.rules상 request.auth.uid == uid만 write 가능해 클라 직접 write로 충분하다
// (Functions 경유 불필요 — sessions/messages 등 가드레일 대상 컬렉션과 달리 민감 로직 없음).
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

export async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const lastLoginAt = serverTimestamp();

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      createdAt: lastLoginAt,
      lastLoginAt,
    });
    return;
  }

  await setDoc(ref, { lastLoginAt }, { merge: true });
}

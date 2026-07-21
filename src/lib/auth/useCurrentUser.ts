"use client";

// 인증 상태 훅 (Track C, T18, AC-027) — Architecture.md §7.
// onAuthStateChanged 구독 1곳으로 로그인 상태(loading/user)를 노출한다. RouteGuard와
// 향후 사용자 정보가 필요한 화면(T15 히스토리 등)이 공용으로 재사용한다.
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export type CurrentUserState = {
  user: User | null;
  loading: boolean;
};

export function useCurrentUser(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({ user: null, loading: true });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({ user, loading: false });
    });
    return unsubscribe;
  }, []);

  return state;
}

"use client";

// 인증 무효화 배너의 상태 훅 (T128, Architecture.md §34.3~§34.5).
//
// ⛔ **신규 인증 구독 0건**(§34.3 표 ①행 · 인계 ⓓ): `onIdTokenChanged`를 추가하지 않는다. 이 결함에
//    대한 검출력 증가가 **0**이기 때문이다 — 조용히 죽는 경로(`auth/invalid-refresh-token`)에서는
//    상태 변화 자체가 없어 어떤 구독도 발화하지 않는다(T128 프로브 P-2가 라이브로 확인).
//    ⛔ `useCurrentUser()`를 여기서 다시 부르지도 않는다(그러면 `onAuthStateChanged` 구독이 하나
//    늘어난다). 호출자(RouteGuard)가 이미 들고 있는 값을 **인자로 받는다**.
// ⛔ **주기 폴링·워치독 타이머 0건**(G157). 감지는 사건 기반 2곳(② auth 이벤트 · ③ 콜러블 오류)과
//    **경계 프리플라이트 1회**(⑤)로 끝난다.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup, signOut, type AuthError, type User } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { getChallengeToken } from "@/lib/recording";
import {
  TRAINING_PATHS,
  resolveAuthInvalidationMode,
  type AuthInvalidationMode,
} from "./authInvalidation";
import { AUTH_INVALIDATION_COPY } from "./copy";
import {
  setCallablesBlocked,
  subscribeUnauthenticatedCallable,
} from "./unauthenticatedSignal";

export type AuthInvalidationState = {
  mode: AuthInvalidationMode;
  message: string;
  actionLabel: string;
  /** 재인증·재시작이 끝나지 않았을 때의 부가 안내(팝업 차단·취소·다른 계정 등). */
  notice: string | null;
  busy: boolean;
  onAction: () => void;
};

const IDLE: Omit<AuthInvalidationState, "onAction"> = {
  mode: "none",
  message: "",
  actionLabel: "",
  notice: null,
  busy: false,
};

export function useAuthInvalidation(input: {
  user: User | null;
  loading: boolean;
  pathname: string;
}): AuthInvalidationState {
  const { user, loading, pathname } = input;
  const router = useRouter();

  const [unauthenticatedSeen, setUnauthenticatedSeen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 마지막으로 관측된 인증 사실. ⛔ 저장소에 영속화하지 않는다(G158): 새로고침하면 그대로
  // 사라지는 것이 맞다. ⚠️ ref가 아니라 state인 이유 — 판정에 **렌더에서** 읽는 값이라
  // (`react-hooks/refs`) ref로 두면 값이 바뀌어도 배너가 갱신되지 않는다.
  const [lastKnown, setLastKnown] = useState<{ uid: string; isAnonymous: boolean } | null>(null);
  const preflightPathRef = useRef<string | null>(null);
  const recheckedRef = useRef(false);

  // 로그인 상태 전이(없음↔있음, 계정 교체)를 렌더 중에 흡수한다 — React가 문서화한 "prop이 바뀔 때
  // state를 조정하는" 패턴이며, effect에서 setState하면 렌더가 한 번 더 도는 데다 lint가 막는다.
  const currentUid = user?.uid ?? null;
  const [seenUid, setSeenUid] = useState<string | null>(currentUid);
  if (seenUid !== currentUid) {
    setSeenUid(currentUid);
    if (user) {
      // ⭐ `user.isAnonymous`가 사용자1/사용자2를 인증 객체로 가르는 유일한 값이다(§34.5 4).
      // SDK가 이미 주는 값이라 신규 필드·스키마 0건이다.
      setLastKnown({ uid: user.uid, isAnonymous: user.isAnonymous });
      setUnauthenticatedSeen(false);
      setNotice(null);
    }
    // ⛔ 로그아웃(user → null)에서는 lastKnown을 지우지 않는다 — 그 값이 "이 참가자가 익명이었는가"를
    //    말해 주는 유일한 근거이고, 지우면 사용자2가 계정형 문구를 보게 된다.
  }

  // 감지 지점 ③ — 콜러블 단일 래퍼가 `functions/unauthenticated`를 봤을 때만 깨어난다(G156).
  useEffect(() => subscribeUnauthenticatedCallable(() => setUnauthenticatedSeen(true)), []);

  const mode = loading
    ? "none"
    : resolveAuthInvalidationMode({
        pathname,
        signedOut: user === null,
        hadUser: lastKnown !== null,
        unauthenticatedCallable: unauthenticatedSeen,
        wasAnonymous: lastKnown?.isAnonymous ?? false,
      });

  // §34.4 U1 — 배너가 떠 있는 동안 새 콜러블을 시작하지 않는다(AC-007 불변식 보호).
  useEffect(() => {
    setCallablesBlocked(mode !== "none");
    return () => setCallablesBlocked(false);
  }, [mode]);

  // 감지 지점 ⑤ — **훈련 경로 진입 시 1회** 강제 갱신. 무효화된 토큰이면 SDK가 그 자리에서 스스로
  // signOut해 ②로 수렴한다(§34.2 (가), 프로브 P-1b에서 관측). ⛔ 실패 자체를 배너 사유로 쓰지
  // 않는다(G156) — 오프라인 같은 정상 실패까지 배너가 되면 그게 오탐이다.
  useEffect(() => {
    if (loading || !user) return;
    if (!(TRAINING_PATHS as readonly string[]).includes(pathname)) return;
    if (preflightPathRef.current === pathname) return;
    preflightPathRef.current = pathname;
    user.getIdToken(true).catch((err: unknown) => {
      console.warn("[authinvalidation] 훈련 진입 프리플라이트 토큰 갱신 실패", err);
    });
  }, [user, loading, pathname]);

  // §34.4 3행 — 콜러블이 `unauthenticated`를 냈는데 `user`는 아직 살아 있는 경우, 그 시점에
  // `getIdToken(true)` 1회. 무효화면 SDK가 signOut하며 2행으로 수렴한다.
  useEffect(() => {
    if (!unauthenticatedSeen || !user || recheckedRef.current) return;
    recheckedRef.current = true;
    user.getIdToken(true).catch((err: unknown) => {
      console.warn("[authinvalidation] unauthenticated 응답 후 토큰 재확인 실패", err);
    });
  }, [unauthenticatedSeen, user]);

  useEffect(() => {
    if (!unauthenticatedSeen) recheckedRef.current = false;
  }, [unauthenticatedSeen]);

  // 계정형 재인증 — ⛔ `signInWithPopup`만(G154). `signInWithRedirect` 폴백은 이 경로에서 쓰지
  // 않는다: 페이지를 떠나는 순간 훈련 세션이 파괴되어, 이 처방이 고치려던 것을 스스로 재현한다.
  const expectedUid = lastKnown?.uid ?? null;
  const reauth = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // 다른 계정으로 로그인했으면 그 계정으로는 이 세션 문서를 읽을 수 없다 — "복구된 것처럼
      // 보이지만 실은 아닌" 상태를 만들지 않기 위해 즉시 되돌리고, 배너는 그대로 둔다(§34.4 2행).
      if (expectedUid !== null && result.user.uid !== expectedUid) {
        await signOut(auth).catch(() => {});
        setNotice(AUTH_INVALIDATION_COPY.reauth.otherAccount);
        return;
      }
      setUnauthenticatedSeen(false);
    } catch (err) {
      const code = (err as AuthError | undefined)?.code;
      if (code === "auth/popup-blocked") setNotice(AUTH_INVALIDATION_COPY.reauth.popupBlocked);
      else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
        setNotice(AUTH_INVALIDATION_COPY.reauth.cancelled);
      else setNotice(AUTH_INVALIDATION_COPY.reauth.failed);
    } finally {
      setBusy(false);
    }
  }, [expectedUid]);

  // 익명 재시작 — OQ-A23 사용자 확정(2026-07-28) "솔직히 끝났다고 알리고 처음부터".
  // ⛔ `/login`으로 보내지 않는다(G153, AC-048). 되돌아갈 곳은 **받았던 초대 링크**뿐이고,
  // 그 토큰이 이 브라우저에 없으면 없는 경로를 만들어 주지 않고 사실대로 안내한다.
  const restart = useCallback(() => {
    const token = getChallengeToken();
    if (!token) {
      setNotice(AUTH_INVALIDATION_COPY.anonymous.noRestartPath);
      return;
    }
    router.push(`/challenge/join?token=${encodeURIComponent(token)}`);
  }, [router]);

  if (mode === "none") return { ...IDLE, onAction: () => {} };

  if (mode === "banner-anonymous") {
    return {
      mode,
      message: AUTH_INVALIDATION_COPY.anonymous.message,
      actionLabel: AUTH_INVALIDATION_COPY.anonymous.action,
      notice,
      busy: false,
      onAction: restart,
    };
  }

  return {
    mode,
    message: AUTH_INVALIDATION_COPY.reauth.message,
    actionLabel: AUTH_INVALIDATION_COPY.reauth.action,
    notice,
    busy,
    onAction: () => {
      void reauth();
    },
  };
}

"use client";

// UX-006(구 "사기범 역할극 채팅")은 UX-014(단일 연속 통화)로 흡수되며 Deprecated 이관됐다
// (docs/UX.md D-11, 2026-07-22). 이 라우트는 옛 북마크·뒤로가기 대비 리다이렉트만 남긴다 —
// 실제 화면·로직은 /session/play(UX-014)가 전담한다.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SessionChatRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/session/play");
  }, [router]);

  return null;
}

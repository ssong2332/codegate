"use client";

// §134 — 어느 화면에서든 주소에 붙인 진단 플래그(`audiodebug` · `outaftermic` · `voicetrim`)를 탭 sessionStorage에 남긴다
// (`debugFlags.ts` 표 F1~F5). 그리는 것은 없다(DOM 0). 관찰 · 판정은 각 판독 지점이 `readDebugFlagSearch()`로 한다.
import { useEffect } from "react";
import { readDebugFlagSearch } from "@/lib/realtime/debugFlags";

export default function DebugFlagCapture() {
  useEffect(() => {
    readDebugFlagSearch();
  }, []);
  return null;
}

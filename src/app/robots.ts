// §133(DECISIONS #249) — robots.txt. 공개 페이지는 허용하고 로그인 뒤 앱 화면은 막는다. 경로 목록은 `@/lib/seo/publicPages`.
// 정적 export(next.config.ts `output: "export"`)라 빌드 때 `out/robots.txt`로 굳는다.
import type { MetadataRoute } from "next";
import { DISALLOW_PREFIXES, SITE_URL } from "@/lib/seo/publicPages";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...DISALLOW_PREFIXES] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

// §133(DECISIONS #249) — sitemap.xml. 검색에 내보낼 공개 페이지만 싣는다(`@/lib/seo/publicPages` SITEMAP_PATHS).
// 법적 고지는 초안 · noindex(LEGAL_ROBOTS)인 동안 빼고, SHOW_LEGAL_LINKS가 켜지면 함께 싣는다.
import type { MetadataRoute } from "next";
import { SITE_URL, SITEMAP_PATHS } from "@/lib/seo/publicPages";
import { SHOW_LEGAL_LINKS } from "@/lib/legal/legalContent";
import { LEGAL_PATHS } from "@/lib/auth/anonymousScope";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths: readonly string[] = SHOW_LEGAL_LINKS ? [...SITEMAP_PATHS, ...LEGAL_PATHS] : SITEMAP_PATHS;
  return paths.map((path) => ({ url: path === "/" ? SITE_URL : `${SITE_URL}${path}` }));
}

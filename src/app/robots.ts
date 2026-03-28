import { MetadataRoute } from "next";
import { CANONICAL_SITE_ORIGIN } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${CANONICAL_SITE_ORIGIN}/sitemap.xml`,
  };
}

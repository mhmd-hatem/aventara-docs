import type { MetadataRoute } from "next";
import { indexingEnabled } from "@/lib/indexing.mjs";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: indexingEnabled()
      ? { userAgent: "*", allow: "/", disallow: ["/api/", "/*/api/"] }
      : { userAgent: "*", disallow: "/" },
  };
}

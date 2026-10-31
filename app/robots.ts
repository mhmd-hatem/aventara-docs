import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules:
      process.env.AVENTARA_INDEXING === "enabled"
        ? { userAgent: "*", allow: "/", disallow: ["/api/", "/*/api/"] }
        : { userAgent: "*", disallow: "/" },
  };
}

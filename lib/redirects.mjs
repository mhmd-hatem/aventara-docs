export function docsRedirects(products) {
  return [
    ...["aventara-framework.vercel.app", "aventara-docs.vercel.app"].map(
      (host) => ({
        source: "/:path*",
        has: [{ type: "host", value: host }],
        destination: "https://aventara.razor34.dev/framework/:path*",
        permanent: true,
      }),
    ),
    ...products.flatMap((p) =>
      (p.redirects ?? []).map((r) => ({
        source: `/${p.id}/docs/${r.from}`,
        destination: `/${p.id}/docs/${r.to}`,
        permanent: true,
      })),
    ),
    {
      source: "/docs/:path*",
      destination: "/framework/docs/:path*",
      permanent: true,
    },
  ];
}

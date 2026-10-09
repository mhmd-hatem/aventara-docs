export function GET() {
  return Response.json(
    { error: "Documentation search is unavailable during the rebuild." },
    {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    },
  );
}

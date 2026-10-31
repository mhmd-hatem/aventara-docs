import { NextResponse } from "next/server";
export function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/framework/api/search";
  return NextResponse.redirect(url, 308);
}

import { llmsFull, markdownResponse } from "@/lib/llms";

export const dynamic = "force-static";

export async function GET() {
  return markdownResponse(await llmsFull());
}

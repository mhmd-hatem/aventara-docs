import { getSource } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";
const indexes = new Map<string, ReturnType<typeof createFromSource>>();
export async function GET(
  request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product } = await params;
  const source = getSource(product);
  if (!source) return new Response("Unknown product", { status: 404 });
  let api = indexes.get(product);
  if (!api) {
    api = createFromSource(source);
    indexes.set(product, api);
  }
  return api.GET(request);
}

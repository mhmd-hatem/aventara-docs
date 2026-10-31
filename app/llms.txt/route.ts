import { products } from "@/lib/products";
import { markdownResponse } from "@/lib/llms";
export const dynamic = "force-static";
export function GET() {
  return markdownResponse(
    "# Aventara\n\n> Product documentation. Choose a product before consulting its API.\n\n## Products\n\n" +
      products
        .map((p) => `- [${p.name}](/${p.id}/llms.txt): ${p.description}`)
        .join("\n") +
      "\n",
  );
}

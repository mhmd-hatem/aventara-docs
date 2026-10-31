import { products, getProduct } from "@/lib/products";
import { getSource, publishedPages } from "@/lib/source";
export function llmsIndex(id: string) {
  const product = getProduct(id)!;
  const source = getSource(id)!;
  const groups = new Map<string, string[]>();
  for (const entry of publishedPages(product)) {
    const page = source.getPage([entry.slug])!;
    const links = groups.get(entry.group) ?? [];
    links.push(
      `- [${page.data.title}](/${id}/markdown/${entry.slug}): ${page.data.description ?? ""}`,
    );
    groups.set(entry.group, links);
  }
  return (
    [
      `# Aventara ${product.name}`,
      `> ${product.description}`,
      `Version: ${product.currentVersion}. Release candidate; breaking changes are possible before a stable release. Links are relative to this deployment.`,
      `## Complete documentation\n\n- [Full Markdown](/${id}/llms-full.txt): All published ${product.name} pages.`,
      ...Array.from(
        groups,
        ([title, links]) => `## ${title}\n\n${links.join("\n")}`,
      ),
    ].join("\n\n") + "\n"
  );
}
export async function llmsFull(id: string) {
  const product = getProduct(id)!;
  const source = getSource(id)!;
  const documents = await Promise.all(
    publishedPages(product).map(async (entry) => {
      const page = source.getPage([entry.slug])!;
      return `Source: [${page.data.title}](${page.url})\n\n${await page.data.getText("processed")}`;
    }),
  );
  return `# Aventara ${product.name} — complete documentation\n\nVersion: ${product.currentVersion}\n\n${documents.join("\n\n---\n\n")}\n`;
}
export function markdownResponse(body: string) {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
export function productParams() {
  return products.map((p) => ({ product: p.id }));
}

import { pages } from "@/lib/navigation";
import { AVENTARA_VERSION } from "@/lib/release";
import { source } from "@/lib/source";

const overview = `> Aventara is a contract-driven TypeScript API framework. A Prisma schema and Aventara configuration produce contracts, a typed HTTP API, and a generated frontend client.

Documentation for ${AVENTARA_VERSION}. Breaking changes are still possible before 1.0; pin exact versions and follow the upgrade guide.

Links beginning with / are relative to the deployment serving this file.`;

function documentationPages() {
  return pages.map((entry) => {
    const page = source.getPage([entry.slug]);
    if (!page) throw new Error(`Missing documentation page: ${entry.slug}`);
    return { ...entry, page };
  });
}

export function llmsIndex() {
  const groups = new Map<string, string[]>();
  for (const { group, page } of documentationPages()) {
    const links = groups.get(group) ?? [];
    const description = page.data.description
      ? `: ${page.data.description.replace(/\s+/g, " ")}`
      : "";
    links.push(`- [${page.data.title}](${page.url})${description}`);
    groups.set(group, links);
  }

  return (
    [
      "# Aventara",
      overview,
      "## Complete documentation\n\n- [Full documentation in Markdown](/llms-full.txt): All published pages, including examples, the AI agent guide, API references, and release history.",
      ...Array.from(
        groups,
        ([title, links]) => `## ${title}\n\n${links.join("\n")}`,
      ),
    ].join("\n\n") + "\n"
  );
}

export async function llmsFull() {
  const documents = await Promise.all(
    documentationPages().map(async ({ page }) => {
      const raw = await page.data.getText("raw");
      // Strip only the page's leading metadata; preserve all examples verbatim.
      const body = raw
        .replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
        .trim();
      return `Source: [${page.data.title}](${page.url})\n\n${body}`;
    }),
  );
  return `# Aventara — complete documentation\n\n${overview}\n\n${documents.join("\n\n---\n\n")}\n`;
}

export function markdownResponse(body: string) {
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

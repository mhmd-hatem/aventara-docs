import { defineDocs, defineConfig } from "fumadocs-mdx/config";
export const docs = defineDocs({
  dir: "aventara-docs-content",
  docs: { files: ["[0-9]*.md"] },
});
export default defineConfig();

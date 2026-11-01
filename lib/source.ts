import { collections } from "@/.generated/collections";
import manifest from "@/.generated/manifest.json";
import { loader } from "fumadocs-core/source";
import { getProduct, productPages, type Product } from "./products";
const sources = Object.fromEntries(
  Object.entries(collections).map(([id, docs]) => [
    id,
    loader({
      baseUrl: `/${id}/docs`,
      source: docs.toFumadocsSource(),
      slugs: (file) => [file.path.replace(/^\d+-/, "").replace(/\.mdx?$/, "")],
    }),
  ]),
);
export function getSource(id: string) {
  return getProduct(id) ? sources[id] : undefined;
}
export function getDrafts(
  id: string,
): Record<string, { title: string; ids: string[] }> {
  return (
    (
      manifest as Record<
        string,
        { drafts: Record<string, { title: string; ids: string[] }> }
      >
    )[id]?.drafts ?? {}
  );
}
export function publishedPages(product: Product) {
  const source = getSource(product.id)!;
  return productPages(product).filter((p) => source.getPage([p.slug]));
}
export function shellProduct(product: Product): Product {
  const drafts = getDrafts(product.id);
  return {
    ...product,
    navigation: product.navigation.map((g) => ({
      ...g,
      items: g.items.filter(([slug]) => !drafts[slug]),
    })),
  };
}

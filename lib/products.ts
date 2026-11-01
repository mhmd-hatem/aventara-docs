import entries from "@/.generated/products.json";
export type Product = (typeof entries)[number];
export const products: Product[] = entries;
export function getProduct(id: string) {
  return products.find((p) => p.id === id);
}
export function productPages(product: Product) {
  return [
    ...product.navigation.flatMap((group) =>
      group.items.map(([slug, title]) => ({
        slug,
        title,
        group: group.title,
        section: group.section,
      })),
    ),
    ...product.topPages,
  ];
}
export function primarySection(product: Product, pathname: string) {
  return (
    productPages(product).find(
      (p) => pathname === `/${product.id}/docs/${p.slug}`,
    )?.section ?? "overview"
  );
}

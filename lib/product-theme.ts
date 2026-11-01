import type { CSSProperties } from "react";
import type { Product } from "./products";
export function productTheme(product: Product): CSSProperties {
  return Object.fromEntries(
    Object.entries(product.theme).flatMap(([mode, tokens]) =>
      Object.entries(tokens).map(([key, value]) => [
        `--product-${mode}-${key}`,
        value,
      ]),
    ),
  ) as CSSProperties;
}

import type { Product } from "@/lib/products";
export function ProductMark({ product }: { product: Product }) {
  if (!product.logo.light)
    return (
      <span className={`product-symbol ${product.accent}`} aria-hidden="true">
        {product.name.slice(0, 1)}
      </span>
    );
  return (
    <span className={`product-symbol product-mark ${product.accent}`}>
      <img
        className="logo-light"
        src={product.logo.light}
        alt={`${product.name} logo`}
        width={40}
        height={40}
      />
      <img
        className="logo-dark"
        src={product.logo.dark}
        alt={`${product.name} logo`}
        width={40}
        height={40}
      />
    </span>
  );
}

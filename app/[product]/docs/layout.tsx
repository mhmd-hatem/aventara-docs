import { notFound } from "next/navigation";
import { getProduct } from "@/lib/products";
import { shellProduct } from "@/lib/source";
import { DocsShell } from "@/components/docs-shell";
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ product: string }>;
}) {
  const { product: id } = await params;
  const product = getProduct(id);
  if (!product) notFound();
  return (
    <DocsShell key={id} product={shellProduct(product)}>
      {children}
    </DocsShell>
  );
}

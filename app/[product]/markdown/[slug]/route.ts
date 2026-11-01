import { products } from "@/lib/products";
import { getSource } from "@/lib/source";
import { markdownResponse } from "@/lib/llms";
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return products.flatMap((p) =>
    getSource(p.id)!
      .getPages()
      .map((page) => ({ product: p.id, slug: page.slugs[0] })),
  );
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ product: string; slug: string }> },
) {
  const { product, slug } = await params;
  const page = getSource(product)?.getPage([slug]);
  return page
    ? markdownResponse(await page.data.getText("processed"))
    : new Response("Not found", { status: 404 });
}

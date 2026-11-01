import { getProduct } from "@/lib/products";
import { llmsIndex, markdownResponse, productParams } from "@/lib/llms";
export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = productParams;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product } = await params;
  return getProduct(product)
    ? markdownResponse(llmsIndex(product))
    : new Response("Not found", { status: 404 });
}

import { permanentRedirect } from "next/navigation";
export default async function LegacyDocs({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/framework/docs/${slug?.join("/") ?? "introduction"}`);
}

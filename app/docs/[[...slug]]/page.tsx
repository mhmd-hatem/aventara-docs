import { redirect } from "next/navigation";

export const metadata = { robots: { index: false, follow: false } };

// Keep direct and client-side docs requests closed during the rebuild.
export default function DocsPage() {
  redirect("/");
}

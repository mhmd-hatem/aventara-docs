export default function DocumentationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DocsShell>{children}</DocsShell>;
}
import { DocsShell } from "@/components/docs-shell";

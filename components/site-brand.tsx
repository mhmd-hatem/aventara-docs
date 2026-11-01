import { Logo } from "@/components/logo";
export function SiteBrand() {
  return (
    <span className="site-brand">
      <Logo icon />
      <span>
        Aventara
        <span className="brand-signature">BUILD FROM WHAT YOU KNOW</span>
      </span>
    </span>
  );
}

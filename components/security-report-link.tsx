import { ArrowUpRight, ShieldCheck } from "lucide-react";

export function SecurityReportLink() {
  return (
    <a
      className="security-report-link"
      href="https://github.com/mhmd-hatem/aventara-docs/security/advisories/new"
      title="Report privately to the Aventara maintainers on GitHub"
    >
      <ShieldCheck size={14} aria-hidden="true" />
      <span>Report a security vulnerability</span>
      <span className="sr-only"> privately on GitHub</span>
      <ArrowUpRight size={12} aria-hidden="true" />
    </a>
  );
}

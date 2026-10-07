import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="not-found" id="main-content">
      <span className="eyebrow">404 / OFF THE MAP</span>
      <h1>This page isn’t in the contract.</h1>
      <p>The link may have moved. Head back to the docs to find your way.</p>
      <Button asChild>
        <Link href="/docs/introduction">
          <ArrowLeft size={16} /> Back to documentation
        </Link>
      </Button>
    </main>
  );
}

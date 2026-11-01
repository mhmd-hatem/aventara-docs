import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="not-found" id="main-content">
      <span className="eyebrow">404 / OFF THE MAP</span>
      <h1>This page isn’t in the contract.</h1>
      <p>
        Choose Framework or Access from the homepage to find the right guide.
      </p>
      <Button asChild>
        <Link href="/">
          <ArrowLeft size={16} /> Back to Aventara
        </Link>
      </Button>
    </main>
  );
}

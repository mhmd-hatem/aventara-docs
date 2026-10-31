import { permanentRedirect } from "next/navigation";
export function GET() {
  permanentRedirect("/framework/llms-full.txt");
}

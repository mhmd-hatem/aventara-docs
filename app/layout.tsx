import type { Metadata } from "next";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import "./experience.css";
import "./motion.css";
import "./scrollbars.css";
import { Providers } from "@/components/providers";
export const metadata: Metadata = {
  title: {
    default: "Aventara — Developer documentation",
    template: "%s · Aventara",
  },
  description:
    "From your Prisma schema to a typed API and frontend client. Build with Aventara, the contract-driven framework for TypeScript.",
  icons: {
    icon: [
      { url: "/branding/favicons/favicon.svg", type: "image/svg+xml" },
      { url: "/branding/favicons/favicon.ico" },
    ],
    apple: "/branding/favicons/apple-touch-icon.png",
  },
  manifest: "/branding/favicons/site.webmanifest",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

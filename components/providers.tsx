"use client";
import { ThemeProvider } from "next-themes";
import { InteractionMotion } from "@/components/interaction-motion";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <InteractionMotion />
    </ThemeProvider>
  );
}

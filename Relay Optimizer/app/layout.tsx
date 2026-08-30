import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay Room — Swimming Relay Optimizer",
  description: "Build fast, fair, rule-ready swimming relay lineups for your full meet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import { ShowcaseBridge } from "@/components/ShowcaseBridge";
import { IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const serif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Off Season",
  description:
    "A detective walks a shuttered pier that is generated a shot at a time, watched by a vision model that reprompts itself when the picture drifts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${serif.variable}`}>
      <body><ShowcaseBridge />{children}</body>
    </html>
  );
}

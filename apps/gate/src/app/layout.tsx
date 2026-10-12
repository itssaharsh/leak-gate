import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo({ variable: "--ff-display", subsets: ["latin"], axes: ["wdth"] });
const body = Public_Sans({ variable: "--ff-body", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--ff-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Leak Gate · where your merge request sends customer data",
  description:
    "Leak Gate plants a synthetic customer in every merge request's review app, finds each log and API her data reaches, and a GitLab Duo flow fixes the leak before it merges.",
};

export const viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

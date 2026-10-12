import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Greenstem · plant subscriptions",
  description: "A fictional plant subscription shop, built as the app under test for Leak Gate.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-[#16241B]">
        <header className="border-b border-[#E3E8E1]">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight text-[#24603A]">
              greenstem
            </Link>
            <div className="flex gap-5 text-sm">
              <Link href="/#plans" className="hover:underline">Plans</Link>
              <Link href="/support" className="hover:underline">Help</Link>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[#E3E8E1] px-5 py-6 text-center text-xs text-[#55635A]">
          Greenstem is a fictional shop built to be tested by Leak Gate. No plants ship and no payment is taken.
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Protected photography proofing, payment, and delivery platform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}

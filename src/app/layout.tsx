import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OwnselfReno — 3D renovation AI",
  description:
    "OwnselfReno: upload a floorplan, orbit your blank house shell, dress rooms with photos, and chat to edit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full font-[family-name:var(--font-sans)] antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

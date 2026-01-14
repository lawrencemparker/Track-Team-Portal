import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Team Portal",
  description: "Track Team Portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

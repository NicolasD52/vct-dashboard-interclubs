import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VCT — Bilan de saison",
  description: "Volant Club Toulousain — bilan de saison interclubs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

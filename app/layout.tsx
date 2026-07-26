import type { Metadata } from "next";
import { Archivo_Black } from "next/font/google";
import "./globals.css";

// Police de titrage du club. Servie par next/font, qui la télécharge et
// l'auto-héberge au build : pas de fichier binaire à maintenir dans le dépôt.
const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo-black",
});

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
    <html lang="fr" className={archivoBlack.variable}>
      <body>{children}</body>
    </html>
  );
}

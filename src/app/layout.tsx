import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const archivo = localFont({
  src: "./fonts/archivo.woff2",
  weight: "100 900",
  variable: "--font-archivo",
  display: "swap",
  adjustFontFallback: false,
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const metadata: Metadata = {
  title: { default: "Aesteros · Estudios de neuromarketing", template: "%s · Aesteros" },
  description: "Diseña, aplica y analiza estudios de mirada, asociación, percepción y rendimiento digital.",
  icons: {
    icon: [
      { url: "/brand/aesteros/aesteros-favicon-claro.svg", type: "image/svg+xml" },
      {
        url: "/brand/aesteros/aesteros-favicon-oscuro.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF7E6" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0907" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

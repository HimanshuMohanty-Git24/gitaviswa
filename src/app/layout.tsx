import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, Tiro_Devanagari_Sanskrit } from "next/font/google";
import "./globals.css";

// Variable faces (full axes). Pinning discrete weights narrows the axis, which makes Google intermittently serve
// `/l/font?kit=…&skey=…` instance URLs that Turbopack 15.5 can't resolve. All three cover the full IAST range.
const inter = Inter({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-inter", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-source-serif", display: "swap" });
const tiro = Tiro_Devanagari_Sanskrit({ subsets: ["devanagari", "latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-tiro", display: "swap" });

export const metadata: Metadata = {
  title: "GitaViśva · The Bhagavad Gita as a knowledge graph",
  description:
    "Explore all 701 verses of the Bhagavad Gita as an interactive knowledge graph: read them with translations and commentary, trace how ideas connect, ask questions grounded in the text, and map your own reflections privately.",
  applicationName: "GitaViśva",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0b" },
    { media: "(prefers-color-scheme: light)", color: "#f5f4f1" },
  ],
};

// Resolve the theme before first paint (no flash): a pinned choice wins, otherwise follow the system.
const themeScript = `try{var p=localStorage.getItem('gitaviswa:theme');var t=p==='light'||p==='dark'?p:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${sourceSerif.variable} ${tiro.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

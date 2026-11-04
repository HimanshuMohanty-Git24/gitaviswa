import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, Tiro_Devanagari_Sanskrit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Variable faces (full axes). Pinning discrete weights narrows the axis, which makes Google intermittently serve
// `/l/font?kit=…&skey=…` instance URLs that Turbopack 15.5 can't resolve. All three cover the full IAST range.
const inter = Inter({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-inter", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-source-serif", display: "swap" });
const tiro = Tiro_Devanagari_Sanskrit({ subsets: ["devanagari", "latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-tiro", display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(SITE ? { metadataBase: new URL(SITE) } : {}),
  title: "GitaViśva · The Bhagavad Gita as a knowledge graph",
  description:
    "Explore all 701 verses of the Bhagavad Gita as an interactive knowledge graph: read them with translations and commentary, trace how ideas connect, ask questions grounded in the text, and map your own reflections privately.",
  applicationName: "GitaViśva",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "GitaViśva",
    title: "GitaViśva · The Bhagavad Gita as a knowledge graph",
    description: "Read all 701 verses, see how the Gita's ideas connect, and bring your own questions to it.",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Krishna and Arjuna's chariot in silhouette against a sunset over Kurukshetra." }],
  },
  twitter: { card: "summary_large_image", images: ["/og.jpg"] },
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
// The server always renders the home page. A link straight into a tool (?view=…, or the older ?node=/?trace=/?ask=)
// hides it before first paint so it doesn't flash; page.tsx clears the flag once that tool is showing.
// Mirrors viewFromQuery() in page.tsx.
const entryScript = `try{var q=new URLSearchParams(location.search),v=q.get('view');if(v?v!=='home':(q.get('node')||q.get('trace')||q.get('ask')||q.get('chat')==='1'))document.documentElement.dataset.entry='deep'}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${sourceSerif.variable} ${tiro.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: entryScript }} />
      </head>
      <body>
        {children}
        {/* Vercel Web Analytics: cookieless page-view counts, no personal data. Only on Vercel deployments
            (VERCEL is set at build time there), so copies run on someone's own computer send nothing. */}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}

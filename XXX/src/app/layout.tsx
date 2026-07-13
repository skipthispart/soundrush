import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SoundRush — Music Downloader",
  description:
    "Download music from YouTube, Spotify, SoundCloud, Deezer, YouTube Music, Tidal, Apple Music and more. Audio up to FLAC Lossless.",
  keywords: [
    "music downloader",
    "YouTube music downloader",
    "Spotify downloader",
    "FLAC",
    "SoundCloud",
    "Deezer",
    "audio downloader",
  ],
  authors: [{ name: "SoundRush" }],
  icons: {
    icon: "/icon.jpeg",
    apple: "/icon.jpeg",
    shortcut: "/icon.jpeg",
  },
  openGraph: {
    title: "SoundRush — Music Downloader",
    description: "Download music from YouTube, Spotify, SoundCloud and more. Audio up to FLAC Lossless.",
    images: ["/icon.jpeg"],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SoundRush — Music Downloader",
    description: "Download music from YouTube, Spotify, SoundCloud and more.",
    images: ["/icon.jpeg"],
  },
  manifest: undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground font-sans`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

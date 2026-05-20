import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PWARegister } from "@/components/layout/PWARegister";
import "./globals.css";

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ether — Live charts",
  description:
    "Charts en vivo de crypto e índices. Alternativa open-source a TradingView.",
  applicationName: "Ether",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ether",
  },
};

export const viewport: Viewport = {
  themeColor: "#131722",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${geist.variable} ${jetbrains.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-tv-bg text-tv-text">
        <TooltipProvider delay={150}>{children}</TooltipProvider>
        <PWARegister />
      </body>
    </html>
  );
}

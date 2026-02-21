import type React from "react"
import type { Metadata } from "next"
import {
  Inter,
  Bangers,
  Space_Grotesk,
  Instrument_Serif,
} from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/toaster"
import { ClerkProvider } from "@clerk/nextjs"
import { GlobalErrorBoundary } from "@/components/ui/error-boundary"
import { FeedbackWidget } from "@/components/ui/feedback-widget"
import { AIGuideWidget } from "@/components/ui/ai-guide-widget"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const bangers = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bangers",
})
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})
const instrumentSerif = Instrument_Serif({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
})

export const metadata: Metadata = {
  title: "KaBoom — AI Comic Creator",
  description:
    "Create stunning AI-generated comics in seconds. Choose your style, describe your story, and watch the magic happen.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${inter.variable} ${bangers.variable} ${spaceGrotesk.variable} ${instrumentSerif.variable}`}
      >
        <head />
        <body className="font-sans antialiased" suppressHydrationWarning>
          <GlobalErrorBoundary>
            {children}
            <FeedbackWidget />
            <AIGuideWidget />
          </GlobalErrorBoundary>
          <Analytics />
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}

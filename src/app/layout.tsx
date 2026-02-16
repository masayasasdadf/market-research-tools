import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '市場調査ツール',
  description: 'AI駆動の市場調査・出店分析ツール',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}

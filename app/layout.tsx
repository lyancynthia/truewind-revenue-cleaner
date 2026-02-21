import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Truewind Revenue Cleaner - Audit-Ready Revenue Schedules',
  description: 'Upload your messy donation export files and download clean revenue schedules ready for auditors and board meetings. The essential tool for nonprofit finance professionals.',
  keywords: 'nonprofit, donation, revenue, accounting, audit, Stripe, PayPal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-white to-slate-50">
        {children}
      </body>
    </html>
  )
}

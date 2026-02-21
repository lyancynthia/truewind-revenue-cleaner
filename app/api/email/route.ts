import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, data, summary } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Send email with Resend
    const dataHtml = `
      <h2>Your Cleaned Revenue Data</h2>
      <p>Thank you for using Truewind Revenue Cleaner!</p>
      <h3>Summary:</h3>
      <ul>
        <li>Total Donations: ${summary?.totalDonations || 0}</li>
        <li>Restricted Donations: ${summary?.restrictedCount || 0}</li>
        <li>Refunds: ${summary?.refundCount || 0}</li>
        <li>Total Amount: $${(summary?.totalAmount || 0).toFixed(2)}</li>
        <li>Effective Donations: ${summary?.effectiveDonations || 0}</li>
      </ul>
      <p>You can download your cleaned revenue schedule from the web interface.</p>
      <p><strong>Truewind</strong> - The essential tool for nonprofit finance professionals.</p>
    `

    const result = await resend.emails.send({
      from: 'Truewind Revenue Cleaner <onboarding@resend.dev>',
      to: email,
      subject: 'Your Cleaned Revenue Data from Truewind',
      html: dataHtml
    })

    console.log('Email sent:', result)

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully'
    })
  } catch (error) {
    console.error('Email error:', error)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}

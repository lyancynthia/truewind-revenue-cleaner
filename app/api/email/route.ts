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
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%); border-radius: 12px; line-height: 48px; font-size: 24px; font-weight: bold; color: white;">T</div>
    <h1 style="margin: 10px 0 0; font-size: 24px; color: #0f172a;">Truewind Revenue Cleaner</h1>
  </div>

  <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a;">Your Data is Ready!</h2>
    <p style="margin: 0 0 16px; color: #475569;">Your donation data has been processed and is now audit-ready. Here's a summary:</p>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Total Transactions</td>
        <td style="text-align: right; font-weight: 600; color: #0f172a;">${summary?.totalDonations || 0}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Effective Donations</td>
        <td style="text-align: right; font-weight: 600; color: #16a34a;">${summary?.effectiveDonations || 0}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Restricted Donations</td>
        <td style="text-align: right; font-weight: 600; color: #d97706;">${summary?.restrictedCount || 0}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">Refunds/Chargebacks</td>
        <td style="text-align: right; font-weight: 600; color: #dc2626;">${summary?.refundCount || 0}</td>
      </tr>
      <tr style="border-top: 2px solid #e2e8f0;">
        <td style="padding: 12px 0 8px; color: #0f172a; font-weight: 600;">Net Total</td>
        <td style="text-align: right; padding: 12px 0 8px; font-weight: 700; font-size: 18px; color: #0f172a;">$${(summary?.totalAmount || 0).toFixed(2)}</td>
      </tr>
    </table>

    <p style="margin: 0; color: #64748b; font-size: 14px;">
      Return to <a href="https://truewind-revenue-cleaner.vercel.app" style="color: #2563eb; text-decoration: none;">Truewind Revenue Cleaner</a> to download your cleaned revenue schedule.
    </p>
  </div>

  <div style="text-align: center; padding: 20px 0; border-top: 1px solid #e2e8f0;">
    <p style="margin: 0 0 8px; color: #64748b; font-size: 14px;">
      Need help with nonprofit accounting?
    </p>
    <a href="https://www.truewind.io" style="display: inline-block; background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
      Learn More About Truewind
    </a>
  </div>

  <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px;">
    The essential tool for nonprofit finance professionals.<br>
    Powered by AI. Built for auditors.
  </p>
</body>
</html>
    `

    const result = await resend.emails.send({
      from: 'Truewind Revenue Cleaner <onboarding@resend.dev>',
      to: email,
      subject: 'Your Cleaned Revenue Schedule is Ready - Download Now',
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

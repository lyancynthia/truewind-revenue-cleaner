import { NextRequest, NextResponse } from 'next/server'
import { convertToCSV, convertToExcel } from '@/lib/fileParser'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { data, format } = body

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'No data provided' },
        { status: 400 }
      )
    }

    let content: string | Buffer
    let contentType: string
    let filename: string

    if (format === 'excel') {
      content = convertToExcel(data)
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      filename = 'cleaned_revenue_schedule.xlsx'
    } else {
      content = convertToCSV(data)
      contentType = 'text/csv'
      filename = 'cleaned_revenue_schedule.csv'
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Failed to generate download' },
      { status: 500 }
    )
  }
}

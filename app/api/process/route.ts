import { NextRequest, NextResponse } from 'next/server'
import { parseFileBuffer } from '@/lib/fileParser'
import { processDonations } from '@/lib/llmProcessor'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Read file as array buffer, then convert to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Parse the file
    const parsed = await parseFileBuffer(buffer, file.name)

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'File appears to be empty' },
        { status: 400 }
      )
    }

    // Process with LLM
    const result = await processDonations(parsed.rows)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to process data', details: result.errors },
        { status: 500 }
      )
    }

    // Return all data and preview (first 10 rows)
    return NextResponse.json({
      success: true,
      previewData: result.data.slice(0, 10),
      fullData: result.data,  // All data for download
      summary: result.summary,
      totalRows: result.data.length
    })
  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

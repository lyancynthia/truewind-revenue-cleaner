import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedRow {
  [key: string]: string | number | boolean | null
}

export interface ParseResult {
  headers: string[]
  rows: ParsedRow[]
  errors: string[]
}

export async function parseCSV(content: Buffer | string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const contentStr = typeof content === 'string' ? content : content.toString('utf-8')

    Papa.parse(contentStr, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || []
        const rows = results.data as ParsedRow[]
        const errors = results.errors.map(e => e.message)

        resolve({ headers, rows, errors })
      },
      error: (error: unknown) => {
        reject(error instanceof Error ? error : new Error('CSV parse error'))
      }
    })
  })
}

export async function parseExcel(content: Buffer): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    try {
      const workbook = XLSX.read(content, { type: 'buffer' })

      // Get the first sheet
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]

      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (jsonData.length === 0) {
        resolve({ headers: [], rows: [], errors: [] })
        return
      }

      // Get headers from first row
      const headers = Object.keys(jsonData[0] as object)

      // Map to ParsedRow format
      const rows = jsonData.map((row: any) => {
        const parsedRow: ParsedRow = {}
        headers.forEach(header => {
          parsedRow[header] = row[header]
        })
        return parsedRow
      })

      resolve({ headers, rows, errors: [] })
    } catch (error) {
      reject(error)
    }
  })
}

export async function parseFileBuffer(buffer: Buffer, fileName: string): Promise<ParseResult> {
  const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()

  if (extension === '.csv') {
    return parseCSV(buffer)
  } else if (extension === '.xlsx' || extension === '.xls') {
    return parseExcel(buffer)
  } else {
    throw new Error(`Unsupported file format: ${extension}`)
  }
}

export function convertToCSV(data: object[]): string {
  return Papa.unparse(data)
}

export function convertToExcel(data: object[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Revenue')

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

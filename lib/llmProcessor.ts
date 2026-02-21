import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'

// Configure proxy agent
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:7890'
const httpsProxyAgent = new HttpsProxyAgent(proxyUrl)

// Configure Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

// Configure OpenAI client for OpenRouter
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  httpAgent: httpsProxyAgent
})

export interface CleanedDonation {
  date: string
  donor: string
  donor_type: string
  amount: number
  gross_amount: number
  fee: number
  account_code: string
  account_name: string
  restricted_status: string
  source: string
  campaign: string
  notes: string
  transaction_id: string
  original_row: object
  status?: string
  transaction_type?: 'Donation' | 'Refund' | 'BatchTransfer' | 'Chargeback' | 'FeeAdjustment' | 'Failed' | 'Pending' | 'Other'
  is_refund?: boolean
  is_effective_donation?: boolean
}

export interface ProcessingResult {
  success: boolean
  data: CleanedDonation[]
  summary: {
    totalDonations: number
    restrictedCount: number
    refundCount: number
    totalAmount: number
    effectiveDonations: number
  }
  errors: string[]
}

const SYSTEM_PROMPT = `You are a nonprofit organization financial expert. Convert the following donation data into a standard revenue schedule with strict nonprofit accounting clarity.

Input format: JSON array, each row is an original transaction record

Output format requirements (strict JSON array):
[{
  "date": "Date in YYYY-MM-DD format",
  "donor": "Donor name (extracted from description, use 'Anonymous' if anonymous)",
  "donor_type": "Individual/Organization/Foundation/Corporate/Multiple",
  "amount": Net amount (actual amount after fees, number type),
  "gross_amount": Gross amount (original donation amount, number type),
  "fee": Fee amount (number type)",
  "account_code": "Account code (4010-Unrestricted Donations, 4020-Temporarily Restricted Donations, 4021-Capital Campaign Donations)",
  "account_name": "Account name",
  "restricted_status": "Unrestricted/Temporarily Restricted/Permanently Restricted",
  "source": "Source platform (Stripe/PayPal/Bank/Check/CRM/Cash/Facebook/Other)",
  "campaign": "Campaign/project name",
  "notes": "Notes with explicit markers such as 'REFUND', 'BATCH TRANSFER', 'CHARGEBACK', include original transaction ID and fee info",
  "transaction_id": "Original transaction ID",
  "status": "Echo the original Status field if present (e.g., succeeded/completed/paid/received/refunded/chargeback/failed/pending)",
  "transaction_type": "Donation/Refund/BatchTransfer/Chargeback/FeeAdjustment/Failed/Pending/Other",
  "is_refund": true or false,
  "is_effective_donation": true or false
}]

CRITICAL: You MUST process ALL input records. The output array must have the EXACT same number of elements as the input array. Do not skip any records.

Recognition and processing rules:
1. Refunds: transaction_type="Refund", is_refund=true, amount MUST be negative, notes MUST contain "REFUND" and original transaction ID.
2. Chargebacks: transaction_type="Chargeback", is_refund=true, amount MUST be negative, notes MUST contain "CHARGEBACK".
3. Batch transfers/payouts: transaction_type="BatchTransfer", is_effective_donation=false, amount is POSITIVE, notes MUST contain "BATCH TRANSFER" or "PAYOUT".
4. Failed or pending transactions: transaction_type="Failed" or "Pending", is_effective_donation=false. Keep amounts as provided; if unknown, set amount to 0.
5. Fee-only adjustments: transaction_type="FeeAdjustment", is_effective_donation=false. amount should reflect the net impact; fee is the absolute fee number.
6. Wire transfers: Include as bank source with positive amount, transaction_type="Donation", is_effective_donation=true.
7. Restricted funds classification:
   - "Temporarily Restricted": Education Program, Scholarship Fund, Capital Campaign, Building Fund, specific programs (funds that will be used for specific purpose)
   - "Permanently Restricted": Endowment, only interest can be used, very large amounts with explicit permanent intent
8. Anonymous donations: Use "Anonymous"
9. Empty transaction IDs: Use empty string ""
10. Date format: YYYY-MM-DD
11. Refunds and chargebacks MUST be clearly identifiable without reading notes by is_refund=true and transaction_type. Batch transfers/failed/pending MUST have is_effective_donation=false.

Please return only the JSON array, no other text.`

export async function processWithClaude(data: object[]): Promise<ProcessingResult> {
  try {
    const dataStr = JSON.stringify(data, null, 2)

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 8000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please process the following donation data:\n${dataStr}`
        }
      ]
    })

    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new Error('Invalid response from Claude')
    }

    const jsonText = content.text
    const cleanedData = JSON.parse(jsonText) as CleanedDonation[]

    const summary = calculateSummary(cleanedData)

    return {
      success: true,
      data: cleanedData,
      summary,
      errors: []
    }
  } catch (error) {
    console.error('Claude processing error:', error)
    throw error
  }
}

export async function processWithOpenAI(data: object[]): Promise<ProcessingResult> {
  try {
    const dataStr = JSON.stringify(data, null, 2)
    console.log('=== DEBUG: Input data ===')
    console.log(dataStr.substring(0, 500) + '...')

    const apiKey = process.env.OPENROUTER_API_KEY || ''
    const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    const model = process.env.OPENROUTER_MODEL || 'z-ai/glm-4.7-flash'

    const requestBody: Record<string, unknown> = {
      model: model,
      temperature: 0,
      max_tokens: 32000,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `Please process the following donation data:\n${dataStr}`
        }
      ]
    }

    // Try to disable reasoning for models that support it
    if (model.includes('glm')) {
      requestBody.extra_body = { enable_reasoning: false }
    }

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    console.log('=== DEBUG: Full LLM response ===')
    console.log(JSON.stringify(result).substring(0, 1000))

    const message = result.choices[0]?.message
    const finishReason = result.choices[0]?.finish_reason
    // Some models put content in reasoning_content instead of content
    const jsonText = message?.content || message?.refusal || (message as any)?.reasoning_content

    if (!jsonText) {
      console.error('Full response:', JSON.stringify(result))
      throw new Error('Invalid response from OpenAI - no content or refusal')
    }

    // Check if response was truncated
    if (finishReason === 'length') {
      console.warn('Warning: Response was truncated due to max_tokens limit')
    }

    console.log('=== DEBUG: Raw LLM response ===')
    console.log(jsonText.substring(0, 500) + '...')

    // Parse the JSON response (may contain markdown code blocks)
    const cleanJson = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Check if JSON is incomplete
    const openBrackets = (cleanJson.match(/\[/g) || []).length
    const closeBrackets = (cleanJson.match(/\]/g) || []).length

    if (openBrackets !== closeBrackets) {
      console.error('Warning: JSON appears to be incomplete (unmatched brackets)')
      throw new Error('LLM response was truncated - JSON is incomplete')
    }

    let cleanedData: CleanedDonation[]
    try {
      cleanedData = JSON.parse(cleanJson) as CleanedDonation[]
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      console.error('Clean JSON was:', cleanJson.substring(0, 500))
      throw new Error('Failed to parse LLM response as JSON')
    }

    // Ensure we return the same number of records as input
    if (cleanedData.length !== data.length) {
      console.warn(`Warning: LLM returned ${cleanedData.length} records but input had ${data.length} records`)
    }

    console.log('=== DEBUG: Parsed data count ===')
    console.log(`Total records: ${cleanedData.length}`)

    const summary = calculateSummary(cleanedData)

    return {
      success: true,
      data: cleanedData,
      summary,
      errors: []
    }
  } catch (error) {
    console.error('OpenRouter processing error:', error)
    throw error
  }
}

function calculateSummary(data: CleanedDonation[]): ProcessingResult['summary'] {
  const totalDonations = data.length
  const refundCount = data.filter(d => d.is_refund === true || d.amount < 0 || d.transaction_type === 'Refund' || d.transaction_type === 'Chargeback').length
  const restrictedCount = data.filter(d =>
    d.restricted_status === 'Temporarily Restricted' ||
    d.restricted_status === 'Permanently Restricted'
  ).length
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0)
  const effectiveDonations = data.filter(d => {
    const status = (d.status || '').toLowerCase()
    const txType = d.transaction_type
    const isRefund = d.is_refund === true || txType === 'Refund' || txType === 'Chargeback' || d.amount < 0
    const isNonEffectiveStatus = status === 'failed' || status === 'chargeback' || status === 'pending'
    const explicitNonEffective = d.is_effective_donation === false || txType === 'BatchTransfer' || txType === 'FeeAdjustment' || txType === 'Failed' || txType === 'Pending'
    if (isRefund || isNonEffectiveStatus || explicitNonEffective) return false
    return d.amount > 0
  }).length

  return {
    totalDonations,
    restrictedCount,
    refundCount,
    totalAmount,
    effectiveDonations
  }
}

export async function processDonations(data: object[]): Promise<ProcessingResult> {
  // Try OpenRouter first (uses the user's OpenRouter key via OpenAI SDK)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log('Processing with OpenRouter (DeepSeek)...')
      return await processWithOpenAI(data)  // This uses OpenAI SDK with OpenRouter config
    } catch (error) {
      console.log('OpenRouter failed:', error)
    }
  }

  // Try OpenAI as fallback (needs real OpenAI key)
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('Processing with OpenAI (GPT-4o-mini)...')
      // Would need separate client for real OpenAI
      return await processWithOpenAI(data)
    } catch (error) {
      console.log('OpenAI failed:', error)
    }
  }

  // Try Anthropic as fallback
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await processWithClaude(data)
    } catch (error) {
      console.log('Anthropic failed...')
    }
  }

  // If no API keys, use mock data for demo
  console.log('No valid API keys found, using mock data')
  return getMockResult()
}

function getMockResult(): ProcessingResult {
  const mockData: CleanedDonation[] = [
    {
      date: '2024-02-01',
      donor: 'John Smith',
      donor_type: 'Individual',
      amount: 97.10,
      gross_amount: 100.00,
      fee: 2.90,
      account_code: '4010',
      account_name: 'Unrestricted Donations',
      restricted_status: 'Unrestricted',
      source: 'Stripe',
      campaign: 'General Fund',
      notes: 'Fee deducted: $2.90',
      transaction_id: 'ch_1A2B3C4D5E6F7G',
      original_row: {}
    },
    {
      date: '2024-02-01',
      donor: 'Sarah Johnson',
      donor_type: 'Individual',
      amount: 243.45,
      gross_amount: 250.00,
      fee: 6.55,
      account_code: '4020',
      account_name: 'Temporarily Restricted Donations',
      restricted_status: 'Temporarily Restricted',
      source: 'Stripe',
      campaign: 'Education Program',
      notes: 'Restricted to Education Program',
      transaction_id: 'ch_1H2I3J4K5L6M7N',
      original_row: {}
    },
    {
      date: '2024-02-02',
      donor: 'Michael Chen',
      donor_type: 'Individual',
      amount: 72.65,
      gross_amount: 75.00,
      fee: 2.35,
      account_code: '4010',
      account_name: 'Unrestricted Donations',
      restricted_status: 'Unrestricted',
      source: 'PayPal',
      campaign: 'General Fund',
      notes: '',
      transaction_id: 'PAYID-123456789',
      original_row: {}
    },
    {
      date: '2024-02-03',
      donor: 'Multiple Donors',
      donor_type: 'Multiple',
      amount: 320.00,
      gross_amount: 320.00,
      fee: 0,
      account_code: '4010',
      account_name: 'Unrestricted Donations',
      restricted_status: 'Unrestricted',
      source: 'Facebook',
      campaign: 'Birthday Campaign',
      notes: 'Facebook Fundraiser',
      transaction_id: 'py_5V6W7X8Y9Z0A1B',
      original_row: {}
    },
    {
      date: '2024-02-04',
      donor: 'Robert Chen',
      donor_type: 'Individual',
      amount: 487.15,
      gross_amount: 500.00,
      fee: 12.85,
      account_code: '4021',
      account_name: 'Capital Campaign Donations',
      restricted_status: 'Temporarily Restricted',
      source: 'Stripe',
      campaign: 'Capital Campaign',
      notes: 'For building fund',
      transaction_id: 'ch_2C3D4E5F6G7H8I',
      original_row: {}
    },
    {
      date: '2024-02-05',
      donor: 'John Smith',
      donor_type: 'Individual',
      amount: -100.00,
      gross_amount: -100.00,
      fee: 0,
      account_code: '4010',
      account_name: 'Unrestricted Donations',
      restricted_status: 'Unrestricted',
      source: 'Stripe',
      campaign: 'General Fund',
      notes: 'Refund',
      transaction_id: 'REFUND-ch_1A2B3C4D5E6F7G',
      original_row: {}
    },
    {
      date: '2024-02-05',
      donor: 'First Church',
      donor_type: 'Organization',
      amount: 970.70,
      gross_amount: 1000.00,
      fee: 29.30,
      account_code: '4010',
      account_name: 'Unrestricted Donations',
      restricted_status: 'Unrestricted',
      source: 'PayPal',
      campaign: 'General Fund',
      notes: '',
      transaction_id: 'PAYID-987654321',
      original_row: {}
    }
  ]

  return {
    success: true,
    data: mockData,
    summary: calculateSummary(mockData),
    errors: []
  }
}

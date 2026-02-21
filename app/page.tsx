'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  Sparkles,
  Download,
  FileSpreadsheet,
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  Download as DownloadIcon,
  Mail,
  TrendingUp,
  Shield,
  Users,
  X
} from 'lucide-react'

interface ProcessingResult {
  success: boolean
  previewData: CleanedDonation[]
  fullData: CleanedDonation[]  // All data for download
  summary: {
    totalDonations: number
    restrictedCount: number
    refundCount: number
    totalAmount: number
    effectiveDonations: number
  }
  downloadUrl?: string
  rawFullData?: any[]
}

interface CleanedDonation {
  date: string
  originalDescription: string
  originalAmount: string
  donor: string
  amount: string
  accountCode: string
  accountName: string
  restrictedStatus: string
  notes: string
  type?: string
  status?: string
  isRefund?: boolean
  isEffective?: boolean
}

type AppState = 'upload' | 'processing' | 'result' | 'error'

export default function Home() {
  const [state, setState] = useState<AppState>('upload')
  const [isDragOver, setIsDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const [interestedInProduct, setInterestedInProduct] = useState(false)
  const [subscribeUpdates, setSubscribeUpdates] = useState(false)
  const [result, setResult] = useState<ProcessingResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [filter, setFilter] = useState<'all' | 'effective' | 'refunds' | 'non_effective'>('all')
  const [sortKey, setSortKey] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['.csv', '.xlsx', '.xls']
    const extension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase()

    if (!validTypes.includes(extension)) {
      setErrorMessage('Please upload CSV or Excel files (.csv, .xlsx, .xls)')
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMessage('File size cannot exceed 10MB')
      return
    }

    setFile(selectedFile)
    setErrorMessage('')
    processFile(selectedFile)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [])

  const processFile = async (fileToProcess: File) => {
    setState('processing')

    try {
      const formData = new FormData()
      formData.append('file', fileToProcess)

      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process file')
      }

      // Transform API response to match frontend interface
      const transformItem = (item: any) => ({
        date: item.date,
        originalDescription: item.campaign || '',
        originalAmount: item.gross_amount ? `$${item.gross_amount.toFixed(2)}` : '',
        donor: item.donor,
        amount: item.amount ? `$${item.amount.toFixed(2)}` : '',
        accountCode: item.account_code,
        accountName: item.account_name,
        restrictedStatus: item.restricted_status,
        notes: item.notes,
        type: item.transaction_type,
        status: item.status,
        isRefund: !!item.is_refund,
        isEffective: item.is_effective_donation !== false && item.amount > 0 && (item.status || '').toLowerCase() !== 'failed' && (item.status || '').toLowerCase() !== 'pending' && (item.status || '').toLowerCase() !== 'chargeback'
      })

      const originalFullData = data.fullData || data.previewData

      const previewData = data.previewData.map(transformItem)
      const fullData = originalFullData.map(transformItem)

      setResult({
        success: true,
        previewData,
        fullData,
        summary: {
          totalDonations: data.summary?.totalDonations ?? originalFullData.length,
          restrictedCount: data.summary?.restrictedCount ?? (originalFullData.filter((d: any) =>
            d.restricted_status === 'Temporarily Restricted' ||
            d.restricted_status === 'Permanently Restricted'
          ).length),
          refundCount: data.summary?.refundCount ?? (originalFullData.filter((d: any) => d.amount < 0).length),
          totalAmount: data.summary?.totalAmount || 0,
          effectiveDonations: data.summary?.effectiveDonations ?? (originalFullData.filter((d: any) => {
            const status = (d.status || '').toLowerCase()
            const txType = d.transaction_type
            const isRefund = d.is_refund === true || txType === 'Refund' || txType === 'Chargeback' || d.amount < 0
            const nonEffectiveStatus = status === 'failed' || status === 'chargeback' || status === 'pending'
            const explicitNonEffective = d.is_effective_donation === false || txType === 'BatchTransfer' || txType === 'FeeAdjustment' || txType === 'Failed' || txType === 'Pending'
            if (isRefund || nonEffectiveStatus || explicitNonEffective) return false
            return d.amount > 0
          }).length)
        },
        rawFullData: originalFullData
      })
      setState('result')
    } catch (error) {
      console.error('Processing error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to process file')
      setState('upload')
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  const resetUpload = () => {
    setState('upload')
    setFile(null)
    setResult(null)
    setErrorMessage('')
    setEmail('')
  }

  const handleDownload = async (format: 'csv' | 'excel') => {
    if (!result?.fullData) return

    try {
      const raw = result.rawFullData || []
      const downloadData = raw.map((d: any) => ({
        date: d.date,
        donor: d.donor,
        donor_type: d.donor_type,
        amount: d.amount,
        gross_amount: d.gross_amount,
        fee: d.fee,
        account_code: d.account_code,
        account_name: d.account_name,
        restricted_status: d.restricted_status,
        source: d.source,
        campaign: d.campaign,
        notes: d.notes,
        transaction_id: d.transaction_id,
        status: d.status || '',
        transaction_type: d.transaction_type || (d.amount < 0 ? 'Refund' : 'Donation'),
        is_refund: d.is_refund === true || d.transaction_type === 'Refund' || d.transaction_type === 'Chargeback' || d.amount < 0,
        is_effective_donation:
          !(d.is_refund === true ||
            d.transaction_type === 'Refund' ||
            d.transaction_type === 'Chargeback' ||
            (d.status || '').toLowerCase() === 'failed' ||
            (d.status || '').toLowerCase() === 'pending' ||
            (d.status || '').toLowerCase() === 'chargeback' ||
            d.transaction_type === 'BatchTransfer' ||
            d.transaction_type === 'FeeAdjustment' ||
            d.transaction_type === 'Failed' ||
            d.transaction_type === 'Pending') && d.amount > 0
      }))

      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: downloadData,
          format
        })
      })

      if (!response.ok) {
        throw new Error('Download failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = format === 'csv' ? 'cleaned_revenue_schedule.csv' : 'cleaned_revenue_schedule.xlsx'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download error:', error)
      alert('Download failed. Please try again.')
    }
  }

  const handleSendEmail = async () => {
    if (!email || !result?.fullData) return

    try {
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          data: result.fullData,
          summary: result.summary
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send email')
      }

      alert('Email sent successfully!')
      setEmail('')
    } catch (error) {
      console.error('Email error:', error)
      alert('Failed to send email. Please try again.')
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Truewind" className="h-8 w-auto" />
          </div>
        </div>
      </header>

      <section className="py-16 md:py-24 px-4">
        <div className="max-w-4xl mx-auto text-center animate-stagger">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Your Donation Data, <span className="gradient-text">Audit-Ready in 10 Seconds</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 mb-12 max-w-2xl mx-auto">
            Upload messy export files from Stripe, PayPal, Bank, or CRM, and download clean revenue schedules ready for auditors and board meetings
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Upload, title: 'Upload', desc: 'Drag & drop your CSV or Excel file', color: 'bg-blue-100 text-blue-600' },
              { icon: Sparkles, title: 'AI Clean', desc: 'Auto-identify donors, amounts, restrictions, fees', color: 'bg-green-100 text-green-600' },
              { icon: Download, title: 'Download', desc: 'Get audit-ready revenue schedules', color: 'bg-cyan-100 text-cyan-600' }
            ].map((step, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * (idx + 1) }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200"
              >
                <div className={`w-12 h-12 ${step.color} rounded-xl flex items-center justify-center mx-auto mb-4`}>
                  <step.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-24 px-4">
        <div className="max-w-2xl mx-auto">
          <AnimatePresence mode="wait">
            {state === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden"
              >
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`upload-area p-12 text-center ${isDragOver ? 'drag-over' : ''}`}
                >
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileInput}
                  />

                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <FileSpreadsheet className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-lg font-medium text-slate-700 mb-2">
                      Drag & drop your file here, or click to upload
                    </p>
                    <p className="text-sm text-slate-500 mb-4">
                      Supports .csv, .xlsx, .xls (max 10MB)
                    </p>
                  </label>
                </div>

                <div className="px-8 pb-8">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-slate-500">
                      🔒 Your data will be deleted immediately after processing
                    </p>
                    <a
                      href="/samples/sample_stripe_paypal_export.csv"
                      download
                      className="text-sm text-green-600 hover:text-green-700 flex items-center gap-1"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      Download Sample File
                    </a>
                  </div>
                </div>

                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-8 mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600">{errorMessage}</p>
                    <button onClick={resetUpload} className="ml-auto text-red-500 hover:text-red-600">
                      <X className="w-5 h-5" />
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}

            {state === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center"
              >
                <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-10 h-10 text-green-600 animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  AI is processing your data...
                </h3>
                <p className="text-slate-500 mb-6">
                  Analyzing file, identifying donors, extracting fees, categorizing restricted funds
                </p>
                {file && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
                    <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">{file.name}</span>
                  </div>
                )}
              </motion.div>
            )}

            {state === 'result' && result && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">
                    Done! Your clean revenue schedule is ready
                  </h2>
                  <p className="text-slate-500 mb-6">
                    Total transactions: {result.summary.totalDonations}. Effective donations: {result.summary.effectiveDonations}. With restrictions: {result.summary.restrictedCount}. Refunds: {result.summary.refundCount}.
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => handleDownload('csv')}
                      className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                      Download CSV
                    </button>
                    <button
                      onClick={() => handleDownload('excel')}
                      className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                      Download Excel
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-900">Data Preview</h3>
                  </div>
                  <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                      <button
                        onClick={() => setFilter('all')}
                        className={`px-3 py-2 text-sm ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilter('effective')}
                        className={`px-3 py-2 text-sm ${filter === 'effective' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                      >
                        Effective
                      </button>
                      <button
                        onClick={() => setFilter('refunds')}
                        className={`px-3 py-2 text-sm ${filter === 'refunds' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                      >
                        Refunds
                      </button>
                      <button
                        onClick={() => setFilter('non_effective')}
                        className={`px-3 py-2 text-sm ${filter === 'non_effective' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`}
                      >
                        Non-Effective
                      </button>
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <select
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as 'date' | 'amount')}
                        className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="date">Sort by Date</option>
                        <option value="amount">Sort by Net Amount</option>
                      </select>
                      <select
                        value={sortDir}
                        onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                        className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="asc">Asc</option>
                        <option value="desc">Desc</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full preview-table">
                      <thead>
                        <tr>
                          <th colSpan={3} className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            Original Data
                          </th>
                          <th className="bg-slate-50 w-8"></th>
                          <th colSpan={6} className="bg-green-50 text-green-700 text-xs uppercase tracking-wider">
                            Cleaned Data
                          </th>
                        </tr>
                        <tr>
                          <th className="text-left">Date</th>
                          <th className="text-left">Description</th>
                          <th className="text-right">Amount</th>
                          <th></th>
                          <th className="text-left">Donor</th>
                          <th className="text-right">Net Amount</th>
                          <th className="text-left">Account</th>
                          <th className="text-left">Restriction</th>
                          <th className="text-left">Type</th>
                          <th className="text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const parseAmount = (s: string) => {
                            const n = Number((s || '').replace(/[$,]/g, ''))
                            return isNaN(n) ? 0 : n
                          }
                          const parseDate = (s: string) => {
                            return new Date(s || '1970-01-01').getTime()
                          }
                          let rows = result.previewData
                          if (filter === 'effective') {
                            rows = rows.filter(r => r.isEffective && !r.isRefund)
                          } else if (filter === 'refunds') {
                            rows = rows.filter(r => r.isRefund)
                          } else if (filter === 'non_effective') {
                            rows = rows.filter(r =>
                              !r.isEffective ||
                              ['BatchTransfer', 'Failed', 'Pending', 'FeeAdjustment'].includes((r.type || ''))
                            )
                          }
                          rows = rows.slice().sort((a, b) => {
                            const av = sortKey === 'amount' ? parseAmount(a.amount) : parseDate(a.date)
                            const bv = sortKey === 'amount' ? parseAmount(b.amount) : parseDate(b.date)
                            return sortDir === 'asc' ? av - bv : bv - av
                          })
                          return rows.map((row, idx) => {
                          const isRefund = row.amount.startsWith('-') || row.amount.startsWith('-$')
                          return (
                          <tr key={idx} className={isRefund ? 'bg-red-50' : ''}>
                            <td className={`text-slate-600 ${isRefund ? 'text-red-600' : ''}`}>{row.date}</td>
                            <td className={`text-slate-600 max-w-[200px] truncate ${isRefund ? 'text-red-600' : ''}`}>{row.originalDescription}</td>
                            <td className={`text-right ${isRefund ? 'text-red-600 font-medium' : 'text-slate-600'}`}>{row.originalAmount}</td>
                            <td className={`text-center ${isRefund ? 'text-red-500' : 'text-green-500'}`}>→</td>
                            <td className={`font-medium ${isRefund ? 'text-red-700' : 'text-slate-900'}`}>{row.donor}</td>
                            <td className={`text-right font-medium ${isRefund ? 'text-red-700' : 'text-slate-900'}`}>{row.amount}</td>
                            <td className={`text-slate-600 ${isRefund ? 'text-red-600' : ''}`}>{row.accountName}</td>
                            <td>
                              {isRefund ? (
                                <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  REFUND
                                </span>
                              ) : (
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                  row.restrictedStatus === 'Unrestricted'
                                    ? 'bg-green-100 text-green-700'
                                    : row.restrictedStatus === 'Temporarily Restricted'
                                    ? 'bg-amber-100 text-amber-700'
                                    : row.restrictedStatus === 'Permanently Restricted'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {row.restrictedStatus || 'N/A'}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                (row.type || '').toLowerCase() === 'refund'
                                  ? 'bg-red-100 text-red-700'
                                  : (row.type || '').toLowerCase() === 'batchtransfer'
                                  ? 'bg-slate-100 text-slate-700'
                                  : (row.type || '').toLowerCase() === 'chargeback'
                                  ? 'bg-red-100 text-red-700'
                                  : (row.type || '').toLowerCase() === 'failed'
                                  ? 'bg-gray-200 text-gray-700'
                                  : (row.type || '').toLowerCase() === 'pending'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {row.type || 'Donation'}
                              </span>
                            </td>
                            <td className={`text-sm ${isRefund ? 'text-red-500' : 'text-slate-500'}`}>{row.notes}</td>
                          </tr>
                        )})})()}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-cyan-50 rounded-2xl border border-green-200 p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Mail className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1">
                        Want to save your results?
                      </h3>
                      <p className="text-sm text-slate-600">
                        Leave your email and we will send a download link plus a donor/board report
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />

                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={interestedInProduct}
                          onChange={(e) => setInterestedInProduct(e.target.checked)}
                          className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500"
                        />
                        <span className="text-sm text-slate-600">
                          I would like to learn how Truewind automates this process
                        </span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={subscribeUpdates}
                          onChange={(e) => setSubscribeUpdates(e.target.checked)}
                          className="w-4 h-4 text-green-600 rounded border-slate-300 focus:ring-green-500"
                        />
                        <span className="text-sm text-slate-600">
                          Send me Truewind product updates (unsubscribe anytime)
                        </span>
                      </label>
                    </div>

                    <button
                      onClick={handleSendEmail}
                      className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                    >
                      Send Me the Report
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-8 md:p-12 text-center text-white">
                  <h2 className="text-2xl md:text-3xl font-bold mb-6">
                    This is just the beginning. Truewind can do so much more.
                  </h2>

                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    {[
                      { icon: TrendingUp, title: 'Real-time Dashboard', desc: 'View fund balances, project expenses, and restricted fund usage anytime' },
                      { icon: Shield, title: 'Audit Support', desc: 'All entries auto-archived, one-click retrieval for auditors' },
                      { icon: Users, title: 'Donor Reports', desc: 'Auto-generate shareable financial stories to build donor trust' }
                    ].map((feature, idx) => (
                      <div key={idx} className="text-center">
                        <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                          <feature.icon className="w-6 h-6 text-green-400" />
                        </div>
                        <h3 className="font-semibold mb-1">{feature.title}</h3>
                        <p className="text-sm text-slate-400">{feature.desc}</p>
                      </div>
                    ))}
                  </div>

                  <a
                    href="https://www.truewind.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-400 transition-colors"
                  >
                    Try Truewind Free
                    <ArrowRight className="w-5 h-5" />
                  </a>

                  <p className="mt-6 text-sm text-slate-400">
                    Used to spend 8 hours every month on reconciliation. Now Truewind does it automatically. — Nonprofit Finance Director
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Truewind" className="h-6 w-auto" />
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-slate-700">Privacy Policy</a>
            <a href="#" className="hover:text-slate-700">Terms of Service</a>
            <a href="#" className="hover:text-slate-700">Contact Us</a>
          </div>
        </div>
      </footer>
    </main>
  )
}

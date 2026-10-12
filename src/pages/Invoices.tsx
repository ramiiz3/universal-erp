import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import jsPDF from "jspdf"
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Printer,
  Search,
} from "lucide-react"
import { useERP, type Sale } from "../context/ERPContext"

const PHARMACY_NAME = "Zaki Pharmacy LLC"
const PHARMACY_ADDRESS = "Shop No. 3, Nuaimeya 1, Ajman"
const PHARMACY_PHONE = "Tel: 067446775"
const PHARMACY_TRN = "TRN: 105461855600003"
const PHARMACY_ARABIC_NAME = "صيدلية زاكي ذ.م.م"
const PHARMACY_ARABIC_ADDRESS = "محل رقم 3، النعيمية 1، عجمان"
const PHARMACY_ARABIC_PHONE = "هاتف: 067446775"
const PHARMACY_ARABIC_TRN = "الرقم الضريبي: 105461855600003"

type PrintFormat = "80mm" | "58mm"

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

function getBatchText(saleItem: Sale["items"][number]) {
  if (!saleItem.batchAllocations.length) return ""

  return saleItem.batchAllocations
    .map(
      (allocation) =>
        `Batch ${allocation.batch} • Exp ${shortDate(allocation.expiry)}`,
    )
    .join(" / ")
}

function loadInvoiceLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error("Unable to load Zaki Pharmacy logo."))

    image.src = "/brand/zaki-logo.png"
  })
}

function getInvoiceBreakdown(sale: Sale) {
  const taxableAmount = sale.items
    .filter((item) => item.vatRate > 0)
    .reduce((sum, item) => sum + item.total, 0)

  const nonTaxableAmount = sale.items
    .filter((item) => item.vatRate === 0)
    .reduce((sum, item) => sum + item.total, 0)

  const discount = sale.discount
  const taxableAfterDiscount = Math.max(0, taxableAmount - discount)

  return {
    grossTotal: sale.subtotal,
    discount,
    taxableAmount: taxableAfterDiscount,
    nonTaxableAmount,
    vatAmount: sale.vat,
    netTotal: sale.total,
  }
}

async function createInvoicePdf(sale: Sale) {
  const pdf = new jsPDF("p", "mm", "a4")

  const left = 14
  const right = 196
  const width = right - left

  const dark = [23, 34, 29] as const
  const green = [47, 158, 99] as const
  const paleGreen = [242, 249, 245] as const
  const border = [218, 227, 222] as const
  const text = [23, 34, 29] as const
  const muted = [100, 116, 107] as const
  const white = [255, 255, 255] as const
  const soft = [248, 251, 249] as const

  let logo: HTMLImageElement | null = null

  try {
    logo = await loadInvoiceLogo()
  } catch {
    logo = null
  }

  pdf.setFillColor(...white)
  pdf.roundedRect(left, 12, width, 50, 4, 4, "F")
  pdf.setDrawColor(...border)
  pdf.roundedRect(left, 12, width, 50, 4, 4, "S")
  pdf.setFillColor(...green)
  pdf.roundedRect(left, 12, 4, 50, 4, 4, "F")

  if (logo) {
    const logoWidth = 60
    const maxLogoHeight = 28
    const ratio = logo.height / logo.width
    let logoHeight = logoWidth * ratio

    if (logoHeight > maxLogoHeight) {
      logoHeight = maxLogoHeight
    }

    pdf.addImage(logo, "PNG", left + 12, 18, logoWidth, logoHeight)
  }

  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text("TAX INVOICE / فاتورة ضريبية", right - 7, 22, { align: "right" })

  pdf.setTextColor(...text)
  pdf.setFontSize(13)
  pdf.text(sale.invoiceNumber, right - 7, 32, { align: "right" })

  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7.5)
  pdf.text(shortDate(sale.createdAt), right - 7, 39, { align: "right" })

  pdf.setTextColor(...text)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(8)
  pdf.text(PHARMACY_NAME, left + 12, 63)
  pdf.text(PHARMACY_ARABIC_NAME, left + 12, 69)
  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(6.5)
  pdf.text(PHARMACY_ADDRESS, left + 12, 75)
  pdf.text(PHARMACY_ARABIC_ADDRESS, left + 12, 81)
  pdf.text(PHARMACY_PHONE, left + 12, 87)
  pdf.text(PHARMACY_ARABIC_PHONE, left + 12, 93)
  pdf.text(PHARMACY_TRN, left + 12, 99)
  pdf.text(PHARMACY_ARABIC_TRN, left + 12, 105)

  let y = 117
  const cardHeight = 26
  const gap = 5
  const cardWidth = (width - gap) / 2

  pdf.setFillColor(...soft)
  pdf.setDrawColor(...border)
  pdf.roundedRect(left, y, cardWidth, cardHeight, 3, 3, "FD")
  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)
  pdf.text("Customer / العميل", left + 7, y + 8)
  pdf.setTextColor(...text)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text(sale.customerName || "Walk-in Customer", left + 7, y + 17)

  const rightCardX = left + cardWidth + gap
  pdf.setFillColor(...soft)
  pdf.roundedRect(rightCardX, y, cardWidth, cardHeight, 3, 3, "FD")
  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)
  pdf.text("Payment / الدفع", rightCardX + 7, y + 8)
  pdf.setTextColor(...text)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(10)
  pdf.text(sale.paymentMethod, rightCardX + 7, y + 17)

  y += cardHeight + 10

  pdf.setFillColor(...dark)
  pdf.roundedRect(left, y, width, 10, 3, 3, "F")
  pdf.setTextColor(...white)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)
  pdf.text("Product / المنتج", left + 7, y + 6.5)
  pdf.text("UOM / الوحدة", left + 109, y + 6.5)
  pdf.text("Qty / الكمية", left + 136, y + 6.5, { align: "right" })
  pdf.text("Price / السعر", left + 159, y + 6.5, { align: "right" })
  pdf.text("VAT / ضريبة", left + 176, y + 6.5, { align: "right" })
  pdf.text("Total / الإجمالي", right - 7, y + 6.5, { align: "right" })

  y += 10

  const maxRows = 11
  const rowHeight = 12

  sale.items.slice(0, maxRows).forEach((item, index) => {
    const rowY = y
    const product = item.name
    const lineVat = item.total * (item.vatRate / 100)

    if (index % 2 === 0) {
      pdf.setFillColor(...white)
    } else {
      pdf.setFillColor(...soft)
    }
    pdf.rect(left, rowY, width, rowHeight, "F")
    pdf.setDrawColor(...border)
    pdf.line(left, rowY + rowHeight, right, rowY + rowHeight)

    pdf.setTextColor(...text)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(7)
    pdf.text(product.length > 28 ? `${product.slice(0, 25)}...` : product, left + 7, rowY + 7)

    pdf.setTextColor(...muted)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(6.2)
    pdf.text("Unit / وحدة", left + 109, rowY + 7)

    pdf.text(String(item.quantity), left + 136, rowY + 7, { align: "right" })
    pdf.text(money(item.unitPrice), left + 159, rowY + 7, { align: "right" })
    pdf.text(money(lineVat), left + 176, rowY + 7, { align: "right" })
    pdf.setTextColor(...text)
    pdf.setFont("helvetica", "bold")
    pdf.text(money(item.total), right - 7, rowY + 7, { align: "right" })

    y += rowHeight
  })

  if (sale.items.length > maxRows) {
    pdf.setTextColor(...muted)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(6)
    pdf.text(`${sale.items.length - maxRows} additional item(s) not shown.`, left + 7, y + 5)
    y += 8
  }

  y += 6
  const totalsX = right - 78
  const totalsHeight = 52

  pdf.setFillColor(...white)
  pdf.roundedRect(totalsX, y, 78, totalsHeight, 3, 3, "F")
  pdf.setDrawColor(...border)
  pdf.roundedRect(totalsX, y, 78, totalsHeight, 3, 3, "S")

  const breakdown = getInvoiceBreakdown(sale)
  const totalsY = y + 9

  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(6.7)
  pdf.text("Gross Total / الإجمالي قبل الخصم", totalsX + 7, totalsY)
  pdf.text(money(breakdown.grossTotal), right - 8, totalsY, { align: "right" })

  pdf.text("Discount / الخصم", totalsX + 7, totalsY + 9)
  pdf.setTextColor(...green)
  pdf.text(`- ${money(breakdown.discount)}`, right - 8, totalsY + 9, { align: "right" })

  pdf.setTextColor(...muted)
  pdf.text("Taxable Amount / المبلغ الخاضع للضريبة", totalsX + 7, totalsY + 18)
  pdf.text(money(breakdown.taxableAmount), right - 8, totalsY + 18, { align: "right" })

  pdf.text("Non-taxable Amount / المبلغ غير الخاضع للضريبة", totalsX + 7, totalsY + 27)
  pdf.text(money(breakdown.nonTaxableAmount), right - 8, totalsY + 27, { align: "right" })

  pdf.text("VAT Amount / مبلغ الضريبة", totalsX + 7, totalsY + 36)
  pdf.text(money(breakdown.vatAmount), right - 8, totalsY + 36, { align: "right" })

  pdf.setFillColor(...paleGreen)
  pdf.roundedRect(totalsX + 5, totalsY + 41, 68, 9, 2, 2, "F")
  pdf.setTextColor(...dark)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)
  pdf.text("Net Total / صافي الإجمالي", totalsX + 10, totalsY + 47)
  pdf.setTextColor(...green)
  pdf.text(money(breakdown.netTotal), right - 10, totalsY + 47, { align: "right" })

  const footerY = 280
  pdf.setDrawColor(...border)
  pdf.setLineWidth(0.5)
  pdf.line(left, footerY, right, footerY)
  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(6.8)
  pdf.text("Computer-generated invoice / فاتورة تم إنشاؤها بواسطة النظام", left, footerY + 7)
  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.text("UniversalERP", right, footerY + 7, { align: "right" })

  pdf.save(`${sale.invoiceNumber}.pdf`)
}

export default function Invoices() {
  const navigate = useNavigate()
  const { invoiceId } = useParams()
  const { sales, customers, products } = useERP()
  const [search, setSearch] = useState("")
  const [selectedPrintFormat, setSelectedPrintFormat] = useState<PrintFormat | null>(null)

  const selectedSale = useMemo(() => {
    if (!invoiceId) return null

    return (
      sales.find(
        (sale) => sale.id === invoiceId || sale.invoiceNumber === invoiceId,
      ) ?? null
    )
  }, [sales, invoiceId])

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...sales]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((sale) => {
        if (!query) return true
        return (
          sale.invoiceNumber.toLowerCase().includes(query) ||
          sale.customerName.toLowerCase().includes(query)
        )
      })
  }, [sales, search])

  function getCustomerEmail(sale: Sale) {
    if (!sale.customerId) return ""
    return customers.find((customer) => customer.id === sale.customerId)?.email || ""
  }

  function getCustomerWhatsApp(sale: Sale) {
    if (!sale.customerId) return ""
    return customers.find((customer) => customer.id === sale.customerId)?.whatsapp || ""
  }

  function sendEmailDraft(sale: Sale) {
    const email = getCustomerEmail(sale)
    if (!email) {
      window.alert("No customer email is available for this invoice.")
      return
    }

    const subject = encodeURIComponent(`Invoice ${sale.invoiceNumber} - ${PHARMACY_NAME}`)
    const body = encodeURIComponent(
      `Dear ${sale.customerName},\n\nPlease find your invoice details below.\n\nInvoice: ${sale.invoiceNumber}\nAmount: AED ${sale.total.toFixed(2)}\nPayment: ${sale.paymentMethod}\n\nRegards,\n${PHARMACY_NAME}`,
    )

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`
  }

  function sendWhatsAppDraft(sale: Sale) {
    const whatsapp = getCustomerWhatsApp(sale)
    if (!whatsapp) {
      window.alert("No WhatsApp number is available for this invoice.")
      return
    }

    const message = encodeURIComponent(
      `Invoice ${sale.invoiceNumber} from ${PHARMACY_NAME}\nAmount: AED ${sale.total.toFixed(2)}\nPayment: ${sale.paymentMethod}`,
    )

    const number = whatsapp.replace(/[^\d]/g, "")
    window.open(`https://wa.me/${number}?text=${message}`, "_blank", "noopener,noreferrer")
  }

  function printInvoice(format: PrintFormat) {
    setSelectedPrintFormat(format)
    window.setTimeout(() => {
      window.print()
    }, 80)
  }

  if (invoiceId && !selectedSale) {
    return (
      <section className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="font-semibold text-red-800">Invoice not found</h2>
          <p className="mt-1 text-sm text-red-700">
            The requested invoice is not present in the current sales data.
          </p>
          <button
            type="button"
            onClick={() => navigate("/invoices")}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Back to Invoices
          </button>
        </div>
      </section>
    )
  }

  if (!selectedSale) {
    return (
      <section className="min-h-full bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-slate-700" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Invoices
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Access invoices generated from completed sales.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice number or customer..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-[#2F9E63] focus:ring-2 focus:ring-[#2F9E63]/15"
              />
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left">
                <thead className="border-b border-slate-200 bg-[#17221D]">
                  <tr>
                    {[
                      "Invoice",
                      "Customer",
                      "Date",
                      "Payment",
                      "Total",
                      "Action",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className={`px-5 py-4 text-xs font-semibold uppercase tracking-wide text-white/80 ${
                          heading === "Action" ? "text-right" : ""
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((sale) => (
                    <tr key={sale.id} className="transition hover:bg-[#F3FAF6]">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{sale.invoiceNumber}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {sale.items.length} item{sale.items.length === 1 ? "" : "s"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-700">{sale.customerName}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{formatDate(sale.createdAt)}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-900">AED {sale.total.toFixed(2)}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/invoices/${sale.invoiceNumber}`)}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#17221D] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#24342B]"
                        >
                          <FileText className="h-4 w-4" />
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center">
                        <FileText className="mx-auto h-9 w-9 text-slate-300" />
                        <p className="mt-3 font-medium text-slate-700">No invoices yet</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Completed POS sales will generate invoices here.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    )
  }

  const sale = selectedSale
  const breakdown = getInvoiceBreakdown(sale)

  return (
    <section className="min-h-full bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-[1050px]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print">
          <button
            type="button"
            onClick={() => navigate("/invoices")}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => createInvoicePdf(sale)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#17221D] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#24342B]"
            >
              <Printer className="h-4 w-4" />
              Print A4
            </button>

            <button
              type="button"
              onClick={() => printInvoice("80mm")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Print 80 mm
            </button>

            <button
              type="button"
              onClick={() => printInvoice("58mm")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Print 58 mm
            </button>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 no-print">
          <button
            type="button"
            onClick={() => sendEmailDraft(sale)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-[#F3FAF6]"
          >
            <Mail className="h-4 w-4 text-[#2F9E63]" />
            Email Invoice
          </button>

          <button
            type="button"
            onClick={() => sendWhatsAppDraft(sale)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-[#F3FAF6]"
          >
            <MessageCircle className="h-4 w-4 text-[#2F9E63]" />
            WhatsApp Invoice
          </button>
        </div>

        <div className="invoice-print-area mx-auto w-full max-w-[210mm] bg-white p-[10mm] shadow-xl">
          <div className="overflow-hidden rounded-[18px] border border-slate-200">
            <div className="relative overflow-hidden bg-[#17221D] px-7 py-7 text-white">
              <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#2F9E63]/20" />
              <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-[#2F9E63]/10" />

              <div className="relative flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-[190px] items-center justify-center">
                      <img src="/brand/zaki-logo.png" alt="Zaki Pharmacy" className="h-full w-full object-contain" />
                    </div>
                  </div>

                  <div className="mt-4 space-y-1 text-left text-[10px] font-medium text-white/75">
                    <p>{PHARMACY_NAME}</p>
                    <p>{PHARMACY_ADDRESS}</p>
                    <p>{PHARMACY_PHONE}</p>
                    <p>{PHARMACY_TRN}</p>
                    <p dir="rtl" className="text-right text-[10px] font-medium text-white/75">
                      {PHARMACY_ARABIC_NAME}
                    </p>
                    <p dir="rtl" className="text-right text-[10px] font-medium text-white/75">
                      {PHARMACY_ARABIC_ADDRESS}
                    </p>
                    <p dir="rtl" className="text-right text-[10px] font-medium text-white/75">
                      {PHARMACY_ARABIC_PHONE}
                    </p>
                    <p dir="rtl" className="text-right text-[10px] font-medium text-white/75">
                      {PHARMACY_ARABIC_TRN}
                    </p>
                  </div>

                  <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    <FileText className="h-3.5 w-3.5" />
                    TAX INVOICE / فاتورة ضريبية
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wider text-emerald-200/70">
                    Invoice / رقم الفاتورة
                  </p>
                  <p className="mt-1 text-xl font-bold">{sale.invoiceNumber}</p>
                  <p className="mt-1 text-xs text-white/80">{formatDate(sale.createdAt)}</p>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2F9E63] px-3 py-1.5 text-[11px] font-semibold text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {sale.status}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 bg-white p-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-[#F7FAF8] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2F9E63]">
                  Customer / العميل
                </p>
                <p className="mt-2 text-base font-bold text-[#17221D]">{sale.customerName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {sale.customerId ? "Registered Customer / عميل مسجل" : "Walk-in Customer / عميل عابر"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-[#F7FAF8] p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2F9E63]">
                      Date / التاريخ
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#17221D]">
                      <CalendarDays className="h-4 w-4 text-[#2F9E63]" />
                      {shortDate(sale.createdAt)}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2F9E63]">
                      Payment / الدفع
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#17221D]">{sale.paymentMethod}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-3">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[1.4fr_60px_70px_90px_70px_95px] gap-3 bg-[#17221D] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">
                  <span>Product / المنتج</span>
                  <span className="text-right">UOM / الوحدة</span>
                  <span className="text-right">Qty / الكمية</span>
                  <span className="text-right">Price / السعر</span>
                  <span className="text-right">VAT / ضريبة</span>
                  <span className="text-right">Total / الإجمالي</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {sale.items.map((item, index) => {
                    const product = products.find((candidate) => candidate.id === item.productId)
                    const itemVat = item.total * (item.vatRate / 100)

                    return (
                      <div
                        key={item.id}
                        className={`grid grid-cols-[1.4fr_60px_70px_90px_70px_95px] gap-3 px-4 py-4 ${
                          index % 2 === 0 ? "bg-[#FBFCFB]" : "bg-white"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#17221D]">{item.name}</p>
                          {getBatchText(item) && (
                            <p className="mt-1 text-[10px] font-medium text-[#2F9E63]">{getBatchText(item)}</p>
                          )}
                        </div>
                        <span className="text-right text-sm text-slate-600">{product?.unit ?? "Unit / وحدة"}</span>
                        <span className="text-right text-sm font-medium text-slate-600">{item.quantity}</span>
                        <span className="text-right text-sm text-slate-600">AED {item.unitPrice.toFixed(2)}</span>
                        <span className="text-right text-sm text-slate-600">AED {itemVat.toFixed(2)}</span>
                        <span className="text-right text-sm font-semibold text-[#17221D]">AED {item.total.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-5 px-6 pb-6 pt-4 sm:grid-cols-[1fr_360px]">
              <div className="flex flex-col justify-end">
                <div className="rounded-2xl bg-[#F7FAF8] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2F9E63]">
                    Payment Summary / ملخص الدفع
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Payment Method / طريقة الدفع: {sale.paymentMethod}
                  </p>
                  {sale.discount > 0 && (
                    <p className="mt-1 text-sm text-slate-600">Discount / الخصم: AED {sale.discount.toFixed(2)}</p>
                  )}
                  <p className="mt-1 text-sm text-slate-600">
                    Cash / النقد: AED {sale.paymentMethod === "Cash" ? Math.max(0, sale.total).toFixed(2) : "0.00"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Change / الباقي: AED {sale.paymentMethod === "Cash" ? "0.00" : "0.00"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Gross Total / الإجمالي قبل الخصم</span>
                    <span className="font-medium text-slate-800">AED {breakdown.grossTotal.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Discount / الخصم</span>
                    <span className="font-medium text-[#2F9E63]">- AED {breakdown.discount.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Taxable Amount / المبلغ الخاضع للضريبة</span>
                    <span className="font-medium text-slate-800">AED {breakdown.taxableAmount.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Non-taxable Amount / المبلغ غير الخاضع للضريبة</span>
                    <span className="font-medium text-slate-800">AED {breakdown.nonTaxableAmount.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">VAT Amount / مبلغ الضريبة</span>
                    <span className="font-medium text-slate-800">AED {breakdown.vatAmount.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2F9E63]">
                          Net Total / صافي الإجمالي
                        </p>
                        <p className="mt-1 text-xs text-slate-400">Inclusive of applicable VAT / شامل الضريبة المطبقة</p>
                      </div>

                      <p className="text-2xl font-bold tracking-tight text-[#17221D]">AED {breakdown.netTotal.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-200 bg-[#17221D] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-white">{PHARMACY_NAME}</p>
                <p className="mt-1 text-[10px] text-white/60">{PHARMACY_ADDRESS}</p>
                <p className="text-[10px] text-white/60">{PHARMACY_PHONE} • {PHARMACY_TRN}</p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/60">Powered by</p>
                <p className="mt-1 text-xs font-bold text-[#2F9E63]">UniversalERP</p>
              </div>
            </div>
          </div>
        </div>

        <div className={`thermal-receipt-area thermal-80 ${selectedPrintFormat === "80mm" ? "is-visible" : ""}`} data-format="80mm">
          <div className="thermal-receipt-card">
            <div className="thermal-header">
              <div className="thermal-brand">ZAKI PHARMACY LLC</div>
              <div className="thermal-brand-ar">صيدلية زاكي ذ.م.م</div>
              <div>{PHARMACY_ADDRESS}</div>
              <div>{PHARMACY_PHONE}</div>
              <div>{PHARMACY_TRN}</div>
            </div>

            <div className="thermal-title">TAX INVOICE / فاتورة ضريبية</div>
            <div className="thermal-meta-row">
              <span>Invoice / رقم الفاتورة: {sale.invoiceNumber}</span>
              <span>{new Date(sale.createdAt).toLocaleDateString("en-GB")}</span>
            </div>
            <div className="thermal-meta-row"><span>Customer / العميل: {sale.customerName}</span></div>
            <div className="thermal-meta-row"><span>Payment / الدفع: {sale.paymentMethod}</span></div>

            <div className="thermal-list-header">
              <span>Product / المنتج</span>
              <span>Qty</span>
              <span>Total</span>
            </div>

            {sale.items.map((item) => (
              <div key={item.id} className="thermal-item-row">
                <div className="thermal-item-head">
                  <span>{item.name}</span>
                  <span>{item.quantity} x AED {item.unitPrice.toFixed(2)}</span>
                </div>
                <div className="thermal-item-sub">
                  <span>VAT {item.vatRate}%</span>
                  <span>AED {item.total.toFixed(2)}</span>
                </div>
              </div>
            ))}

            <div className="thermal-divider" />
            <div className="thermal-summary-row"><span>Gross Total / الإجمالي قبل الخصم</span><span>AED {breakdown.grossTotal.toFixed(2)}</span></div>
            <div className="thermal-summary-row"><span>Discount / الخصم</span><span>- AED {breakdown.discount.toFixed(2)}</span></div>
            <div className="thermal-summary-row"><span>VAT Amount / مبلغ الضريبة</span><span>AED {breakdown.vatAmount.toFixed(2)}</span></div>
            <div className="thermal-summary-row total"><span>Net Total / صافي الإجمالي</span><span>AED {breakdown.netTotal.toFixed(2)}</span></div>
            <div className="thermal-summary-row"><span>Cash / النقد</span><span>AED {sale.paymentMethod === "Cash" ? breakdown.netTotal.toFixed(2) : "0.00"}</span></div>
            <div className="thermal-summary-row"><span>Change / الباقي</span><span>AED 0.00</span></div>
            <div className="thermal-footer">Thank you / شكراً لك</div>
          </div>
        </div>

        <div className={`thermal-receipt-area thermal-58 ${selectedPrintFormat === "58mm" ? "is-visible" : ""}`} data-format="58mm">
          <div className="thermal-receipt-card compact">
            <div className="thermal-header">
              <div className="thermal-brand">ZAKI PHARMACY LLC</div>
              <div className="thermal-brand-ar">صيدلية زاكي ذ.م.م</div>
              <div>{PHARMACY_ADDRESS}</div>
              <div>{PHARMACY_PHONE}</div>
              <div>{PHARMACY_TRN}</div>
            </div>

            <div className="thermal-title">TAX INVOICE / فاتورة ضريبية</div>
            <div className="thermal-meta-row compact-meta"><span>{sale.invoiceNumber}</span><span>{new Date(sale.createdAt).toLocaleDateString("en-GB")}</span></div>
            <div className="thermal-meta-row compact-meta"><span>{sale.customerName}</span></div>
            <div className="thermal-meta-row compact-meta"><span>{sale.paymentMethod}</span></div>

            {sale.items.map((item) => (
              <div key={item.id} className="thermal-item-compact">
                <div className="thermal-item-head compact-head">
                  <span>{item.name}</span>
                  <span>{item.quantity} x {item.unitPrice.toFixed(2)}</span>
                </div>
                <div className="thermal-item-sub compact-sub">
                  <span>VAT {item.vatRate}%</span>
                  <span>{item.total.toFixed(2)}</span>
                </div>
              </div>
            ))}

            <div className="thermal-divider" />
            <div className="thermal-summary-row"><span>Gross</span><span>{breakdown.grossTotal.toFixed(2)}</span></div>
            <div className="thermal-summary-row"><span>Disc</span><span>-{breakdown.discount.toFixed(2)}</span></div>
            <div className="thermal-summary-row"><span>VAT</span><span>{breakdown.vatAmount.toFixed(2)}</span></div>
            <div className="thermal-summary-row total"><span>Total</span><span>{breakdown.netTotal.toFixed(2)}</span></div>
            <div className="thermal-footer">Thank you / شكراً لك</div>
          </div>
        </div>
      </div>
    </section>
  )
}

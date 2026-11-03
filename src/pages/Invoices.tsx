import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import jsPDF from "jspdf"
import {
  ArrowLeft,
  CalendarDays,
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

const REFUND_NOTE = "Medicine once sold cannot be exchanged or refunded as per MOH Regulation."

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

function getInvoiceLineAmounts(sale: Sale, item: Sale["items"][number]) {
  const discountShare =
    sale.subtotal > 0 ? (sale.discount * item.total) / sale.subtotal : 0
  const taxableAmount = Math.max(0, item.total - discountShare)

  return {
    taxableAmount,
    vatAmount: taxableAmount * (item.vatRate / 100),
  }
}

function printThermalReceipt(format: PrintFormat) {
  const widthMm = format === "80mm" ? 80 : 58
  const receiptClass = format === "80mm" ? "thermal-80" : "thermal-58"
  const receiptCard = document.querySelector<HTMLElement>(
    `.${receiptClass} .thermal-receipt-card`,
  )

  if (!receiptCard) {
    window.alert("Unable to prepare the receipt for printing.")
    return
  }

  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    window.alert("Allow pop-ups for this site to print thermal receipts.")
    return
  }

  const printDocument = printWindow.document
  const receiptStyles = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { width: 100%; margin: 0; padding: 0; background: #fff; color: #111; }
    body { font-family: Arial, "Segoe UI", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #thermal-print-root { width: ${widthMm - 4}mm; margin: 0; padding: 0; }
    .thermal-receipt-card { width: 100%; max-width: none; margin: 0; padding: 2mm; font-size: 9px; line-height: 1.35; letter-spacing: 0; overflow-wrap: anywhere; }
    .thermal-receipt-card, .thermal-receipt-card * { box-sizing: border-box; }
    .thermal-header { margin: 0 0 2mm; padding: 0 0 2mm; border-bottom: 1px solid #222; text-align: center; font-size: 9px; line-height: 1.35; }
    .thermal-brand { font-size: 15px; font-weight: 800; letter-spacing: 0.04em; line-height: 1.2; }
    .thermal-brand-ar { margin-top: 0.7mm; font-size: 12px; font-weight: 700; }
    .thermal-arabic { direction: rtl; unicode-bidi: plaintext; }
    .thermal-address { font-size: 9px; }
    .thermal-title { margin: 2mm 0; text-align: center; font-size: 11px; font-weight: 800; }
    .thermal-meta { display: grid; grid-template-columns: 1fr 1.25fr; column-gap: 2mm; row-gap: 0.6mm; margin-bottom: 2mm; font-size: 8.8px; }
    .thermal-meta-label { font-weight: 700; }
    .thermal-meta-value { min-width: 0; text-align: right; overflow-wrap: anywhere; }
    .thermal-meta-row { display: flex; justify-content: space-between; gap: 2mm; margin: 1mm 0; font-size: 8.5px; }
    .thermal-meta-row > span:first-child, .thermal-item-head > span:first-child, .thermal-item-sub > span:first-child { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
    .thermal-meta-row > span:last-child, .thermal-item-head > span:last-child, .thermal-item-sub > span:last-child { flex: 0 0 auto; text-align: right; }
    .thermal-meta-row.compact-meta { display: block; }
    .thermal-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8px; line-height: 1.3; }
    .thermal-table col.product { width: 31%; }
    .thermal-table col.uom { width: 10%; }
    .thermal-table col.qty { width: 8%; }
    .thermal-table col.price { width: 16%; }
    .thermal-table col.vat { width: 15%; }
    .thermal-table col.total { width: 20%; }
    .thermal-table thead { border-top: 1px solid #333; border-bottom: 1px solid #333; }
    .thermal-table th { padding: 1.2mm 0.35mm; text-align: right; font-size: 7.6px; font-weight: 700; vertical-align: bottom; }
    .thermal-table th:first-child, .thermal-table td:first-child { padding-left: 0; text-align: left; }
    .thermal-table td { padding: 1.5mm 0.35mm; text-align: right; vertical-align: top; border-bottom: 1px dotted #888; }
    .thermal-table td.product { text-align: left; font-weight: 600; overflow-wrap: anywhere; word-break: normal; }
    .thermal-table td.uom { font-size: 7.8px; overflow-wrap: anywhere; word-break: normal; }
    .thermal-table .numeric { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .thermal-table .vat-rate { display: block; margin-top: 0.3mm; font-size: 7px; font-weight: 400; }
    .thermal-list-header { display: flex; justify-content: space-between; gap: 2mm; margin-top: 2mm; padding: 2mm 0; border-top: 1px dashed #555; border-bottom: 1px dashed #555; font-size: 8px; font-weight: 700; }
    .thermal-list-header > span:first-child { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
    .thermal-list-header > span:not(:first-child) { flex: 0 0 auto; text-align: right; }
    .thermal-item-row, .thermal-item-compact { break-inside: avoid; }
    .thermal-item-compact { padding: 2mm 0; border-bottom: 1px dashed #aaa; }
    .thermal-item-head, .thermal-item-sub { display: flex; justify-content: space-between; gap: 2mm; font-size: 8.2px; line-height: 1.45; }
    .thermal-item-head { font-weight: 700; }
    .thermal-item-sub { color: #333; }
    .thermal-item-head.compact-head, .thermal-item-sub.compact-sub { font-size: 7.8px; }
    .thermal-summary { margin-top: 2mm; }
    .thermal-summary-row, .thermal-payment-row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; margin: 0.8mm 0; font-size: 8.8px; line-height: 1.3; }
    .thermal-summary-row > span:first-child, .thermal-payment-row > span:first-child { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
    .thermal-summary-row > span:last-child, .thermal-payment-row > span:last-child { flex: 0 0 auto; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .thermal-summary-row.total { margin-top: 1.5mm; padding: 1.5mm 0; border-top: 1px solid #222; border-bottom: 1px solid #222; font-size: 11px; font-weight: 800; }
    .thermal-payment { margin-top: 2mm; }
    .thermal-payment-title { margin-bottom: 1mm; font-size: 8px; font-weight: 700; text-transform: uppercase; }
    .thermal-divider { margin: 2mm 0 1.5mm; border-top: 1px dashed #555; }
    .thermal-footer, .thermal-note { margin-top: 2mm; text-align: center; break-inside: avoid; }
    .thermal-footer { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; }
    .thermal-note { margin-top: 1mm; font-size: 8px; font-weight: 400; line-height: 1.35; overflow-wrap: anywhere; }
    @media print { html, body { page-break-before: auto; page-break-after: auto; } #thermal-print-root, .thermal-receipt-card { break-before: avoid; break-after: avoid; } }
  `

  printDocument.open()
  printDocument.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Thermal invoice</title><style id="thermal-receipt-styles">${receiptStyles}</style></head><body><main id="thermal-print-root">${receiptCard.outerHTML}</main></body></html>`,
  )
  printDocument.close()

  void (async () => {
    try {
      await printDocument.fonts.ready
      await new Promise<void>((resolve) => {
        printWindow.requestAnimationFrame(() => {
          printWindow.requestAnimationFrame(() => resolve())
        })
      })

      const printCard =
        printDocument.querySelector<HTMLElement>(".thermal-receipt-card")
      if (!printCard) {
        throw new Error("The isolated receipt document is empty.")
      }

      const contentHeightMm =
        (printCard.getBoundingClientRect().height * 25.4) / 96
      if (!Number.isFinite(contentHeightMm) || contentHeightMm <= 0) {
        throw new Error("Unable to measure the isolated receipt.")
      }

      const pageHeightMm = Math.ceil(contentHeightMm + 4.5)
      const pageStyle = printDocument.createElement("style")
      pageStyle.textContent = `@page { size: ${widthMm}mm ${pageHeightMm}mm; margin: 2mm; }`
      printDocument.head.append(pageStyle)
      printWindow.addEventListener("afterprint", () => printWindow.close(), {
        once: true,
      })
      printWindow.focus()
      printWindow.print()
    } catch (error) {
      printWindow.close()
      console.error("Unable to print the thermal receipt.", error)
      window.alert("Unable to prepare the receipt for printing.")
    }
  })()
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
  const discountRatio = sale.subtotal > 0 ? discount / sale.subtotal : 0

  return {
    grossTotal: sale.subtotal,
    discount,
    taxableAmount: Math.max(0, taxableAmount * (1 - discountRatio)),
    nonTaxableAmount: Math.max(0, nonTaxableAmount * (1 - discountRatio)),
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
    printThermalReceipt(format)
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
  const activePrintClass = selectedPrintFormat ? `print-format-${selectedPrintFormat}` : "print-format-a4"

  return (
    <section className="invoice-page min-h-full bg-slate-100 p-4 md:p-6">
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
              onClick={() => {
                setSelectedPrintFormat(null)
                window.setTimeout(() => window.print(), 80)
              }}
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

        <div className={`print-shell ${activePrintClass}`}>
          <div className="invoice-print-area mx-auto w-full max-w-[210mm] bg-white p-[10mm] shadow-xl">
            <div className="overflow-hidden rounded-[18px] border border-slate-200">
              <div className="invoice-header relative overflow-hidden bg-white px-7 py-7 text-slate-900">
                <div className="invoice-header-inner relative flex flex-col items-center justify-center gap-2 text-center">
                  <div className="invoice-brand-block">
                    <img src="/brand/zaki-logo.png" alt="Zaki Pharmacy" className="invoice-brand-logo h-14 w-[190px] object-contain" />
                  </div>

                  <div className="invoice-brand-name text-[26px] font-black uppercase tracking-[0.08em] text-slate-900">
                    {PHARMACY_NAME}
                  </div>

                  <div dir="rtl" className="invoice-brand-name-ar text-[22px] font-black text-slate-800">
                    {PHARMACY_ARABIC_NAME}
                  </div>

                  <div className="invoice-header-details mt-2 flex flex-col items-center gap-1 text-[11px] font-medium text-slate-700">
                    <p>{PHARMACY_ADDRESS}</p>
                    <p dir="rtl" className="text-center">{PHARMACY_ARABIC_ADDRESS}</p>
                    <p>{PHARMACY_PHONE}</p>
                    <p dir="rtl" className="text-center">{PHARMACY_ARABIC_PHONE}</p>
                    <p>{PHARMACY_TRN}</p>
                    <p dir="rtl" className="text-center">{PHARMACY_ARABIC_TRN}</p>
                  </div>

                  <div className="mt-4 w-full border-t border-slate-200 pt-3 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      <FileText className="h-3.5 w-3.5" />
                      TAX INVOICE / فاتورة ضريبية
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

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                <p className="invoice-print-note text-[10px] font-medium leading-relaxed text-slate-700">{REFUND_NOTE}</p>
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

          <div
            className={`thermal-receipt-area thermal-80 ${selectedPrintFormat === "80mm" ? "is-visible" : ""}`}
            data-format="80mm"
          >
            <div className="thermal-receipt-card">
              <div className="thermal-header">
                <div className="thermal-brand">ZAKI PHARMACY LLC</div>
                <div className="thermal-brand-ar thermal-arabic" dir="rtl" lang="ar">
                  صيدلية زاكي ذ.م.م
                </div>
                <div className="thermal-address">Shop No. 3, Nuaimeya 1, AJMAN</div>
                <div className="thermal-address thermal-arabic" dir="rtl" lang="ar">
                  {PHARMACY_ARABIC_ADDRESS}
                </div>
                <div className="thermal-address">{PHARMACY_PHONE}</div>
                <div className="thermal-address thermal-arabic" dir="rtl" lang="ar">
                  {PHARMACY_ARABIC_PHONE}
                </div>
                <div className="thermal-address">{PHARMACY_TRN}</div>
                <div className="thermal-address thermal-arabic" dir="rtl" lang="ar">
                  {PHARMACY_ARABIC_TRN}
                </div>
              </div>

              <div className="thermal-title">
                <span>TAX INVOICE</span> /{" "}
                <span className="thermal-arabic" dir="rtl" lang="ar">
                  فاتورة ضريبية
                </span>
              </div>
              <div className="thermal-meta">
                <span className="thermal-meta-label">Date / التاريخ</span>
                <span className="thermal-meta-value">
                  {new Date(sale.createdAt).toLocaleDateString("en-GB")}
                </span>
                <span className="thermal-meta-label">Invoice No. / فاتورة رقم</span>
                <span className="thermal-meta-value">{sale.invoiceNumber}</span>
                <span className="thermal-meta-label">Customer / الزبون</span>
                <span className="thermal-meta-value">{sale.customerName}</span>
              </div>

              <table className="thermal-table">
                <colgroup>
                  <col className="product" />
                  <col className="uom" />
                  <col className="qty" />
                  <col className="price" />
                  <col className="vat" />
                  <col className="total" />
                </colgroup>
                <thead>
                  <tr>
                    <th>PRODUCT</th>
                    <th>UOM</th>
                    <th>QTY</th>
                    <th>PRICE</th>
                    <th>VAT 5%</th>
                    <th>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => {
                    const product = products.find(
                      (candidate) => candidate.id === item.productId,
                    )
                    const lineAmounts = getInvoiceLineAmounts(sale, item)

                    return (
                      <tr key={item.id} className="thermal-item-row">
                        <td className="product">{item.name}</td>
                        <td className="uom">{product?.unit ?? "Unit"}</td>
                        <td className="numeric">{item.quantity}</td>
                        <td className="numeric">{item.unitPrice.toFixed(2)}</td>
                        <td className="numeric">
                          {lineAmounts.vatAmount.toFixed(2)}
                          <span className="vat-rate">{item.vatRate}%</span>
                        </td>
                        <td className="numeric">{item.total.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="thermal-summary">
                <div className="thermal-summary-row">
                  <span>Gross Total / المجموع الكلي</span>
                  <span>{money(breakdown.grossTotal)}</span>
                </div>
                <div className="thermal-summary-row">
                  <span>You have saved / خصم</span>
                  <span>{money(breakdown.discount)}</span>
                </div>
                <div className="thermal-summary-row">
                  <span>Taxable Amount / المبلغ الخاضع للضريبة</span>
                  <span>{money(breakdown.taxableAmount)}</span>
                </div>
                <div className="thermal-summary-row">
                  <span>Non Taxable Amount / مبلغ غير خاضع للضريبة</span>
                  <span>{money(breakdown.nonTaxableAmount)}</span>
                </div>
                <div className="thermal-summary-row">
                  <span>VAT / ضريبة</span>
                  <span>{money(breakdown.vatAmount)}</span>
                </div>
                <div className="thermal-summary-row total">
                  <span>Net Total / صافي الإجمالي</span>
                  <span>{money(breakdown.netTotal)}</span>
                </div>
              </div>

              <div className="thermal-payment">
                <div className="thermal-payment-title">Payment Details</div>
                <div className="thermal-payment-row">
                  <span>Cash / السيولة النقدية</span>
                  <span>{sale.paymentMethod === "Cash" ? money(sale.total) : "—"}</span>
                </div>
                <div className="thermal-payment-row">
                  <span>Change / توازن</span>
                  <span>Not recorded</span>
                </div>
                <div className="thermal-payment-row">
                  <span>Payment Mode</span>
                  <span>{sale.paymentMethod}</span>
                </div>
                <div className="thermal-payment-row">
                  <span>Associate</span>
                  <span>Not recorded</span>
                </div>
              </div>

              <div className="thermal-note">{REFUND_NOTE}</div>
              <div className="thermal-footer">THANK YOU</div>
            </div>
          </div>

          <div
            className={`thermal-receipt-area thermal-58 ${selectedPrintFormat === "58mm" ? "is-visible" : ""}`}
            data-format="58mm"
          >
            <div className="thermal-receipt-card compact">
              <div className="thermal-header">
                <div className="thermal-brand">ZAKI PHARMACY LLC</div>
                <div className="thermal-brand-ar thermal-arabic" dir="rtl" lang="ar">
                  صيدلية زاكي ذ.م.م
                </div>
                <div>{PHARMACY_ADDRESS}</div>
                <div className="thermal-arabic" dir="rtl" lang="ar">
                  {PHARMACY_ARABIC_ADDRESS}
                </div>
                <div>{PHARMACY_PHONE}</div>
                <div className="thermal-arabic" dir="rtl" lang="ar">
                  {PHARMACY_ARABIC_PHONE}
                </div>
                <div>{PHARMACY_TRN}</div>
                <div className="thermal-arabic" dir="rtl" lang="ar">
                  {PHARMACY_ARABIC_TRN}
                </div>
              </div>

              <div className="thermal-title">
                <span>TAX INVOICE</span> /{" "}
                <span className="thermal-arabic" dir="rtl" lang="ar">
                  فاتورة ضريبية
                </span>
              </div>
              <div className="thermal-meta-row compact-meta">
                <span>Invoice / رقم الفاتورة: {sale.invoiceNumber}</span>
              </div>
              <div className="thermal-meta-row compact-meta">
                <span>Date / التاريخ: {new Date(sale.createdAt).toLocaleDateString("en-GB")}</span>
              </div>
              <div className="thermal-meta-row compact-meta">
                <span>Customer / العميل: {sale.customerName}</span>
              </div>
              <div className="thermal-meta-row compact-meta">
                <span>Payment / الدفع: {sale.paymentMethod}</span>
              </div>

              {sale.items.map((item) => (
                <div key={item.id} className="thermal-item-compact">
                  <div className="thermal-item-head compact-head">
                    <span>{item.name}</span>
                    <span>{item.quantity} x AED {item.unitPrice.toFixed(2)}</span>
                  </div>
                  <div className="thermal-item-sub compact-sub">
                    <span>
                      VAT {item.vatRate}% · AED {(item.total * (item.vatRate / 100)).toFixed(2)}
                    </span>
                    <span>AED {item.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}

              <div className="thermal-divider" />
              <div className="thermal-summary-row">
                <span>Gross / الإجمالي</span>
                <span>AED {breakdown.grossTotal.toFixed(2)}</span>
              </div>
              <div className="thermal-summary-row">
                <span>Discount / الخصم</span>
                <span>- AED {breakdown.discount.toFixed(2)}</span>
              </div>
              <div className="thermal-summary-row">
                <span>VAT / الضريبة</span>
                <span>AED {breakdown.vatAmount.toFixed(2)}</span>
              </div>
              <div className="thermal-summary-row total">
                <span>Total / الإجمالي النهائي</span>
                <span>AED {breakdown.netTotal.toFixed(2)}</span>
              </div>
              <div className="thermal-summary-row">
                <span>Cash / النقد</span>
                <span>
                  AED {sale.paymentMethod === "Cash" ? breakdown.netTotal.toFixed(2) : "0.00"}
                </span>
              </div>
              <div className="thermal-summary-row">
                <span>Change / الباقي</span>
                <span>AED 0.00</span>
              </div>
              <div className="thermal-note">{REFUND_NOTE}</div>
              <div className="thermal-footer">Thank you / شكراً لك</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

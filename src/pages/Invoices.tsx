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

const PHARMACY_NAME = "Zaki Pharmacy"

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

function getBatchText(saleItem: Sale["items"][number]) {
  if (!saleItem.batchAllocations.length) return ""

  return saleItem.batchAllocations
    .map(
      (allocation) =>
        `Batch ${allocation.batch} • Exp ${shortDate(
          allocation.expiry,
        )}`,
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

async function createInvoicePdf(sale: Sale) {
  const money = (value: number) => `AED ${value.toFixed(2)}`

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

  /* =====================================================
     HEADER — WHITE / PREMIUM
     ===================================================== */

  pdf.setFillColor(...white)
  pdf.roundedRect(left, 12, width, 49, 4, 4, "F")

  pdf.setDrawColor(...border)
  pdf.setLineWidth(0.5)
  pdf.roundedRect(left, 12, width, 49, 4, 4, "S")

  // Green accent line
  pdf.setFillColor(...green)
  pdf.roundedRect(left, 12, 4, 49, 4, 4, "F")

  // Transparent Zaki logo — no box/background.
  if (logo) {
    const logoWidth = 66
    const maxLogoHeight = 34
    const ratio = logo.height / logo.width

    let logoHeight = logoWidth * ratio

    if (logoHeight > maxLogoHeight) {
      logoHeight = maxLogoHeight
    }

    pdf.addImage(
      logo,
      "PNG",
      left + 11,
      18,
      logoWidth,
      logoHeight,
    )
  }

  // Invoice metadata on the right.
  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(8)
  pdf.text("TAX INVOICE", right - 7, 20, {
    align: "right",
  })

  pdf.setTextColor(...text)
  pdf.setFontSize(13)
  pdf.text(sale.invoiceNumber, right - 7, 29, {
    align: "right",
  })

  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7.5)
  pdf.text(shortDate(sale.createdAt), right - 7, 36, {
    align: "right",
  })

  pdf.setFillColor(...paleGreen)
  pdf.roundedRect(right - 35, 41, 28, 9, 4.5, 4.5, "F")

  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)

  pdf.text(sale.status, right - 21, 46.6, {
    align: "center",
  })

  /* =====================================================
     CUSTOMER / PAYMENT INFORMATION
     ===================================================== */

  let y = 68

  const cardHeight = 29
  const gap = 5
  const cardWidth = (width - gap) / 2

  // Bill To
  pdf.setFillColor(...soft)
  pdf.setDrawColor(...border)
  pdf.roundedRect(left, y, cardWidth, cardHeight, 3, 3, "FD")

  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)

  pdf.text("BILL TO", left + 7, y + 8)

  pdf.setTextColor(...text)
  pdf.setFontSize(10)

  pdf.text(
    sale.customerName || "Walk-in Customer",
    left + 7,
    y + 16,
  )

  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7)

  pdf.text(
    sale.customerId ? "Registered Customer" : "Walk-in Customer",
    left + 7,
    y + 23,
  )

  // Payment / date
  const rightCardX = left + cardWidth + gap

  pdf.setFillColor(...soft)
  pdf.roundedRect(
    rightCardX,
    y,
    cardWidth,
    cardHeight,
    3,
    3,
    "F",
  )

  pdf.setDrawColor(...border)
  pdf.roundedRect(
    rightCardX,
    y,
    cardWidth,
    cardHeight,
    3,
    3,
    "S",
  )

  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)
  pdf.text("PAYMENT", rightCardX + 7, y + 8)

  pdf.setTextColor(...text)
  pdf.setFontSize(10)
  pdf.text(
    sale.paymentMethod,
    rightCardX + 7,
    y + 16,
  )

  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7)
  pdf.text(
    `Invoice Date: ${shortDate(sale.createdAt)}`,
    rightCardX + 7,
    y + 23,
  )

  y += cardHeight + 9

  /* =====================================================
     ITEMS TABLE
     ===================================================== */

  const tableTop = y
  const headerHeight = 10

  pdf.setFillColor(...dark)
  pdf.roundedRect(left, tableTop, width, headerHeight, 3, 3, "F")

  pdf.setTextColor(...white)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7)

  pdf.text("ITEM", left + 7, tableTop + 6.5)

  pdf.text("QTY", 128, tableTop + 6.5, {
    align: "right",
  })

  pdf.text("UNIT", 159, tableTop + 6.5, {
    align: "right",
  })

  pdf.text("AMOUNT", right - 7, tableTop + 6.5, {
    align: "right",
  })

  y += headerHeight

  const maxRows = 11
  const rowHeight = 12

  sale.items.slice(0, maxRows).forEach((item, index) => {
    const rowY = y

    if (index % 2 === 0) {
      pdf.setFillColor(...white)
    } else {
      pdf.setFillColor(...soft)
    }
    pdf.rect(left, rowY, width, rowHeight, "F")

    pdf.setDrawColor(...border)
    pdf.line(left, rowY + rowHeight, right, rowY + rowHeight)

    const itemName =
      item.name.length > 42
        ? `${item.name.slice(0, 39)}...`
        : item.name

    const batchText = getBatchText(item)

    pdf.setTextColor(...text)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(7.8)

    pdf.text(
      itemName,
      left + 7,
      rowY + 5.2,
    )

    pdf.setTextColor(...muted)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(6)

    pdf.text(
      `Barcode: ${item.barcode}`,
      left + 7,
      rowY + 9,
    )

    if (batchText) {
      const batchDisplay =
        batchText.length > 35
          ? `${batchText.slice(0, 32)}...`
          : batchText

      pdf.setTextColor(...green)
      pdf.setFontSize(5.8)

      pdf.text(
        batchDisplay,
        left + 7,
        rowY + 11.2,
      )
    }

    pdf.setTextColor(...muted)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(7.5)

    pdf.text(
      String(item.quantity),
      128,
      rowY + 7,
      { align: "right" },
    )

    pdf.text(
      money(item.unitPrice),
      159,
      rowY + 7,
      { align: "right" },
    )

    pdf.setTextColor(...text)
    pdf.setFont("helvetica", "bold")

    pdf.text(
      money(item.total),
      right - 7,
      rowY + 7,
      { align: "right" },
    )

    y += rowHeight
  })

  if (sale.items.length > maxRows) {
    pdf.setTextColor(...muted)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(6.5)

    pdf.text(
      `${sale.items.length - maxRows} additional item(s) not shown.`,
      left + 7,
      y + 5,
    )

    y += 8
  }

  /* =====================================================
     TOTALS + FOOTER
     ===================================================== */

  y += 7

  const totalsWidth = 78
  const totalsX = right - totalsWidth
  const totalsHeight = 49

  // Compact premium totals card.
  pdf.setFillColor(...white)
  pdf.roundedRect(
    totalsX,
    y,
    totalsWidth,
    totalsHeight,
    3,
    3,
    "F",
  )

  pdf.setDrawColor(...border)
  pdf.roundedRect(
    totalsX,
    y,
    totalsWidth,
    totalsHeight,
    3,
    3,
    "S",
  )

  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7.5)

  pdf.text(
    "Subtotal",
    totalsX + 9,
    y + 10,
  )

  pdf.text(
    money(sale.subtotal),
    right - 9,
    y + 10,
    { align: "right" },
  )

  pdf.text(
    "Discount",
    totalsX + 9,
    y + 19,
  )

  pdf.setTextColor(...green)
  pdf.text(
    `- ${money(sale.discount)}`,
    right - 9,
    y + 19,
    { align: "right" },
  )

  pdf.setTextColor(...muted)
  pdf.text(
    "VAT",
    totalsX + 9,
    y + 28,
  )

  pdf.text(
    money(sale.vat),
    right - 9,
    y + 28,
    { align: "right" },
  )

  // Grand total band
  pdf.setFillColor(...paleGreen)
  pdf.roundedRect(
    totalsX + 5,
    y + 33,
    totalsWidth - 10,
    11,
    2,
    2,
    "F",
  )

  pdf.setTextColor(...dark)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7.5)

  pdf.text(
    "TOTAL",
    totalsX + 10,
    y + 40,
  )

  pdf.setTextColor(...green)
  pdf.setFontSize(10.5)

  pdf.text(
    money(sale.total),
    right - 10,
    y + 40,
    { align: "right" },
  )

  const footerY = 278

  pdf.setDrawColor(...border)
  pdf.setLineWidth(0.5)
  pdf.line(left, footerY, right, footerY)

  pdf.setTextColor(...muted)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(6.8)

  pdf.text(
    "Computer-generated tax invoice",
    left,
    footerY + 7,
  )

  pdf.setTextColor(...green)
  pdf.setFont("helvetica", "bold")

  pdf.text(
    "UniversalERP",
    right,
    footerY + 7,
    { align: "right" },
  )

  pdf.save(`${sale.invoiceNumber}.pdf`)
}




export default function Invoices() {
  const navigate = useNavigate()
  const { invoiceId } = useParams()
  const { sales, customers } = useERP()

  const [search, setSearch] = useState("")

  const selectedSale = useMemo(() => {
    if (!invoiceId) return null

    return (
      sales.find(
        (sale) =>
          sale.id === invoiceId ||
          sale.invoiceNumber === invoiceId,
      ) ?? null
    )
  }, [sales, invoiceId])

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...sales]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime(),
      )
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

    return (
      customers.find(
        (customer) => customer.id === sale.customerId,
      )?.email || ""
    )
  }

  function getCustomerWhatsApp(sale: Sale) {
    if (!sale.customerId) return ""

    return (
      customers.find(
        (customer) => customer.id === sale.customerId,
      )?.whatsapp || ""
    )
  }

  function sendEmailDraft(sale: Sale) {
    const email = getCustomerEmail(sale)

    if (!email) {
      window.alert("No customer email is available for this invoice.")
      return
    }

    const subject = encodeURIComponent(
      `Invoice ${sale.invoiceNumber} - ${PHARMACY_NAME}`,
    )

    const body = encodeURIComponent(
      `Dear ${sale.customerName},\n\nPlease find your invoice details below.\n\nInvoice: ${sale.invoiceNumber}\nAmount: AED ${sale.total.toFixed(2)}\nPayment: ${sale.paymentMethod}\n\nRegards,\n${PHARMACY_NAME}`,
    )

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`
  }

  function sendWhatsAppDraft(sale: Sale) {
    const whatsapp = getCustomerWhatsApp(sale)

    if (!whatsapp) {
      window.alert(
        "No WhatsApp number is available for this invoice.",
      )
      return
    }

    const message = encodeURIComponent(
      `Invoice ${sale.invoiceNumber} from ${PHARMACY_NAME}\nAmount: AED ${sale.total.toFixed(2)}\nPayment: ${sale.paymentMethod}`,
    )

    const number = whatsapp.replace(/[^\d]/g, "")

    window.open(
      `https://wa.me/${number}?text=${message}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  if (invoiceId && !selectedSale) {
    return (
      <section className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="font-semibold text-red-800">
            Invoice not found
          </h2>

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
                    <tr
                      key={sale.id}
                      className="transition hover:bg-[#F3FAF6]"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {sale.invoiceNumber}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {sale.items.length} item
                          {sale.items.length === 1 ? "" : "s"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-700">
                        {sale.customerName}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600">
                        {formatDate(sale.createdAt)}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {sale.paymentMethod}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-900">
                          AED {sale.total.toFixed(2)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/invoices/${sale.invoiceNumber}`)
                          }
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
                      <td
                        colSpan={6}
                        className="px-5 py-14 text-center"
                      >
                        <FileText className="mx-auto h-9 w-9 text-slate-300" />

                        <p className="mt-3 font-medium text-slate-700">
                          No invoices yet
                        </p>

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
              Print
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
            {/* Invoice Header */}
            <div className="relative overflow-hidden bg-[#17221D] px-7 py-7 text-white">
              <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#2F9E63]/20" />
              <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-[#2F9E63]/10" />

              <div className="relative flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-[190px] items-center justify-center">
                      <img
                        src="/brand/zaki-logo.png"
                        alt="Zaki Pharmacy"
                        className="h-full w-full object-contain"
                      />
                    </div>

                  </div>

                  <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    <FileText className="h-3.5 w-3.5" />
                    Tax Invoice
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wider text-emerald-200/70">
                    Invoice Number
                  </p>

                  <p className="mt-1 text-xl font-bold">
                    {sale.invoiceNumber}
                  </p>

                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2F9E63] px-3 py-1.5 text-[11px] font-semibold text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {sale.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Information */}
            <div className="grid gap-4 bg-white p-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-[#F7FAF8] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2F9E63]">
                  Bill To
                </p>

                <p className="mt-2 text-base font-bold text-[#17221D]">
                  {sale.customerName}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {sale.customerId
                    ? "Registered Customer"
                    : "Walk-in Customer"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-[#F7FAF8] p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2F9E63]">
                      Invoice Date
                    </p>

                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#17221D]">
                      <CalendarDays className="h-4 w-4 text-[#2F9E63]" />
                      {shortDate(sale.createdAt)}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2F9E63]">
                      Payment
                    </p>

                    <p className="mt-2 text-sm font-semibold text-[#17221D]">
                      {sale.paymentMethod}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="px-6 pb-3">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[1fr_55px_90px_100px] gap-3 bg-[#17221D] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit</span>
                  <span className="text-right">Amount</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {sale.items.map((item, index) => (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[1fr_55px_90px_100px] gap-3 px-4 py-4 ${
                        index % 2 === 0 ? "bg-[#FBFCFB]" : "bg-white"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#17221D]">
                          {item.name}
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          Barcode: {item.barcode}
                        </p>

                        {getBatchText(item) && (
                          <p className="mt-1 text-[10px] font-medium text-[#2F9E63]">
                            {getBatchText(item)}
                          </p>
                        )}
                      </div>

                      <span className="text-right text-sm font-medium text-slate-600">
                        {item.quantity}
                      </span>

                      <span className="text-right text-sm text-slate-600">
                        AED {item.unitPrice.toFixed(2)}
                      </span>

                      <span className="text-right text-sm font-semibold text-[#17221D]">
                        AED {item.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="grid gap-5 px-6 pb-6 pt-4 sm:grid-cols-[1fr_330px]">
              <div className="flex flex-col justify-end">
                <div className="rounded-2xl bg-[#F7FAF8] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2F9E63]">
                    Payment Summary
                  </p>

                  <p className="mt-2 text-sm text-slate-600">
                    Thank you for choosing {PHARMACY_NAME}.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-medium text-slate-800">
                      AED {sale.subtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Discount</span>
                    <span className="font-medium text-[#2F9E63]">
                      - AED {sale.discount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">VAT</span>
                    <span className="font-medium text-slate-800">
                      AED {sale.vat.toFixed(2)}
                    </span>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2F9E63]">
                          Grand Total
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          Inclusive of applicable VAT
                        </p>
                      </div>

                      <p className="text-2xl font-bold tracking-tight text-[#17221D]">
                        AED {sale.total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-[#17221D] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-white">
                  {PHARMACY_NAME}
                </p>
                <p className="mt-1 text-[10px] text-white/50">
                  This is a computer-generated invoice.
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200/60">
                  Powered by
                </p>

                <p className="mt-1 text-xs font-bold text-[#2F9E63]">
                  UniversalERP
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

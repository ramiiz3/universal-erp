import { useState } from "react"
import { Bot, CheckCircle2, Send, Sparkles } from "lucide-react"
import { useERP } from "../context/ERPContext"
import { getERPSettings } from "../lib/erpSettings"

type Message = { id: string; role: "user" | "assistant"; text: string }

function localDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
}

function currency(value: number, code: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code || "AED" }).format(value)
  } catch {
    return `${code || "AED"} ${value.toFixed(2)}`
  }
}

export default function AI() {
  const { products, inventoryLots, customers, sales, purchases, suppliers } = useERP()
  const settings = getERPSettings()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome",
    role: "assistant",
    text: "Welcome to the local Zaki Pharmacy assistant. I can prepare basic sales, stock, expiry, customer-invoice and purchase summaries directly from your saved ERP records. Nothing is sent to an online AI service.",
  }])

  function answer(question: string) {
    const query = question.toLowerCase()
    const money = (amount: number) => currency(amount, settings.currency)

    if (/low.?stock|stock.*low|reorder|minimum stock/.test(query)) {
      const rows = products.map((product) => ({
        name: product.name,
        sku: product.sku,
        available: inventoryLots.filter((lot) => lot.productId === product.id).reduce((sum, lot) => sum + Number(lot.quantity || 0), 0),
        minimum: Number(product.minimumStock || 0),
      })).filter((item) => item.minimum > 0 && item.available <= item.minimum)
        .sort((a, b) => a.available - b.available)
      return rows.length
        ? "Products at or below minimum stock:\n" + rows.slice(0, 20).map((row) => `• ${row.name}: ${row.available} available (minimum ${row.minimum})${row.sku ? ` · SKU ${row.sku}` : ""}`).join("\n")
        : "No products are currently at or below their minimum-stock level."
    }

    if (/expir|expiry|expire/.test(query)) {
      const from = new Date(); from.setHours(0, 0, 0, 0)
      const until = new Date(from); until.setDate(until.getDate() + 30)
      const rows = inventoryLots.filter((lot) => {
        if (Number(lot.quantity || 0) <= 0 || !lot.expiry) return false
        const date = new Date(lot.expiry)
        if (Number.isNaN(date.getTime())) return false
        date.setHours(0, 0, 0, 0)
        return date >= from && date <= until
      }).sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime())
      return rows.length
        ? "Batches expiring within 30 days:\n" + rows.slice(0, 20).map((lot) => `• ${products.find((p) => p.id === lot.productId)?.name || "Unknown product"} · batch ${lot.batch || "not recorded"} · qty ${lot.quantity} · ${new Date(lot.expiry).toLocaleDateString()}`).join("\n")
        : "No positive-quantity batches expiring in the next 30 days were found."
    }

    if (/today|sales|revenue|turnover/.test(query)) {
      const today = localDateKey(new Date())
      const rows = sales.filter((sale) => {
        const date = new Date(sale.createdAt)
        return !Number.isNaN(date.getTime()) && localDateKey(date) === today
      })
      const paid = rows.filter((sale) => sale.status === "Paid")
      return `Today's sales (${new Date().toLocaleDateString()}):\n• Invoices: ${rows.length}\n• Paid invoices: ${paid.length}\n• Paid sales total: ${money(paid.reduce((sum, sale) => sum + Number(sale.total || 0), 0))}\n• Pending invoices: ${rows.filter((sale) => sale.status === "Pending").length}`
    }

    if (/invoice|customer|bill|receipt/.test(query)) {
      const customer = customers.find((item) => query.includes(item.name.toLowerCase()) || (!!item.phone && query.includes(item.phone.toLowerCase())))
      const rows = sales.filter((sale) => !customer || sale.customerId === customer.id || sale.customerName.toLowerCase() === customer.name.toLowerCase())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)
      if (!rows.length) return customer ? `No invoices found for ${customer.name}.` : "No saved invoices were found."
      return `${customer ? `Invoices for ${customer.name}` : "The 10 most recent invoices"}:\n` + rows.map((sale) => `• ${sale.invoiceNumber} · ${new Date(sale.createdAt).toLocaleDateString()} · ${money(Number(sale.total || 0))} · ${sale.status}`).join("\n")
    }

    if (/purchase|supplier|vendor/.test(query)) {
      const rows = [...purchases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)
      return `Saved suppliers: ${suppliers.length}\n${suppliers.slice(0, 10).map((supplier) => supplier.name).join(", ") || "No suppliers recorded"}\n\nRecent purchases:\n${rows.map((purchase) => `• ${purchase.purchaseNumber} · ${purchase.supplierName} · ${new Date(purchase.createdAt).toLocaleDateString()} · ${money(Number(purchase.total || 0))}`).join("\n") || "No purchases recorded"}`
    }

    return "This standalone ERP does not connect to a free or paid AI service. I can answer built-in questions about today's sales, low stock, batches expiring within 30 days, customer invoices, suppliers and purchases. Please use one of the suggested questions."
  }

  function send(question = input) {
    const text = question.trim()
    if (!text) return
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text }])
    setInput("")
    const reply = answer(text)
    setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", text: reply }])
  }

  const suggestions = ["Show today's sales.", "Which products are low in stock?", "Which products are expiring soon?", "Show recent customer invoices.", "Show recent purchases and suppliers."]

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6 dark:bg-[#0d1510]">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Sparkles className="h-5 w-5" /></div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Zaki Pharmacy Assistant</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Offline insights from your local ERP records</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">Offline · local data only</span>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
            <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-7">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
                    {message.role === "assistant" && <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700"><Bot className="h-3.5 w-3.5" /> Local ERP assistant</div>}
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((item) => <button key={item} type="button" onClick={() => send(item)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">{item}</button>)}
              </div>
              <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send() } }} rows={2} placeholder="Ask about sales, stock, expiry, invoices or purchases..." className="min-h-[54px] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 outline-none" />
                <button type="button" onClick={() => send()} disabled={!input.trim()} aria-label="Send question" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">Processed on this device · No cloud AI connection</p>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-600" /><h2 className="font-semibold text-slate-900 dark:text-slate-100">Available local reports</h2></div>
              <div className="mt-4 space-y-3">{["Today's sales summary", "Low-stock products", "Batches expiring within 30 days", "Customer invoice lookup", "Recent purchases and suppliers"].map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{item}</div>)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Local ERP records</p>
              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{settings.businessName}</p>
              <p className="mt-1 text-sm text-slate-500">{[settings.address, settings.emirate, settings.country].filter(Boolean).join(", ") || "Business location not set"}</p>
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">This assistant reads records saved in this browser and does not send pharmacy data to an AI provider or another database. It provides built-in reports only; open-ended generative AI would require a separate online AI service.</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

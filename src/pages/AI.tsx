import { useState } from "react"
import type { KeyboardEvent } from "react"
import { Bot, LoaderCircle, Send, Sparkles, Wifi, ShieldCheck } from "lucide-react"
import { useERP } from "../context/ERPContext"
import { useAuth } from "../auth/AuthProvider"
import { getERPSettings } from "../lib/erpSettings"
import { supabase, supabaseConfigError } from "../lib/supabase"

type Message = {
  id: string
  role: "user" | "assistant"
  text: string
  model?: string
  sources?: string[]
}

type AssistantResponse = {
  reply?: string
  provider?: string
  model?: string
  sources?: string[]
  error?: string
}

const suggestions = [
  "Show today's sales with invoice numbers and amounts.",
  "Which customers purchased from us today?",
  "Show sales for [customer name] this month.",
  "Which products are low in stock?",
  "Show products expiring in the next 30 days.",
  "Summarise purchases by supplier this month.",
]

export default function AI() {
  const { activeCompany, session } = useAuth()
  const { cloudSyncStatus } = useERP()
  const settings = getERPSettings()
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome",
    role: "assistant",
    text: "Hello. Ask me anything about your ERP records. I can look up sales, customer names, invoices, sale dates, products, purchases, suppliers, stock, batches and business summaries using the live data available to your signed-in account. I am read-only: I will not change ERP records.",
  }])

  async function send(question = input) {
    const text = question.trim()
    if (!text || busy) return
    if (!supabase) {
      setError(supabaseConfigError || "The ERP database connection is not configured.")
      return
    }
    if (!session?.access_token) {
      setError("Your sign-in session is not available. Sign in again and retry.")
      return
    }
    if (!activeCompany?.companyId) {
      setError("Select an active company before asking the ERP Assistant.")
      return
    }

    const history = messages
      .filter((message) => message.id !== "welcome")
      .slice(-8)
      .map((message) => ({ role: message.role, text: message.text }))

    setMessages((current) => [...current, {
      id: "user-" + Date.now(),
      role: "user",
      text,
    }])
    setInput("")
    setError("")
    setBusy(true)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke<AssistantResponse>("zaki-ai", {
        body: {
          message: text,
          companyId: activeCompany.companyId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          history,
        },
        headers: {
          Authorization: "Bearer " + session.access_token,
        },
      })

      if (invokeError) {
        let detail = invokeError.message || "The ERP Assistant could not reach Gemini."
        const context = (invokeError as { context?: unknown }).context
        if (context && typeof context === "object" && "clone" in context) {
          try {
            const response = context as Response
            const payload = await response.clone().json() as AssistantResponse
            if (payload.error) detail = payload.error
          } catch {
            // Keep the SDK error message when the response is not JSON.
          }
        }
        throw new Error(detail)
      }

      if (!data?.reply || typeof data.reply !== "string") {
        throw new Error(data?.error || "The Assistant returned an empty answer. Please try a more specific question.")
      }

      setMessages((current) => [...current, {
        id: "assistant-" + Date.now(),
        role: "assistant",
        text: data.reply as string,
        model: data.model ? data.provider + " · " + data.model : data.provider || "ERP Assistant",
        sources: Array.isArray(data.sources) ? data.sources : [],
      }])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The ERP Assistant request failed. Please retry.")
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6 dark:bg-[#0d1510]">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">ERP Assistant</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Ask questions in plain language about your business records</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Wifi className="h-3.5 w-3.5" />
              Gemini AI
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Read-only access
            </span>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{activeCompany?.companyName || settings.businessName || "Current company"}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Answers are based on records your account can access</p>
              </div>
              <span className="text-[11px] text-slate-400">{cloudSyncStatus === "saved" ? "Cloud data synced" : "Live company records"}</span>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-7" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={"flex " + (message.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={"max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 " + (message.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200")}>
                    {message.role === "assistant" && (
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <Bot className="h-3.5 w-3.5" />
                        ERP Assistant
                      </div>
                    )}
                    {message.text}
                    {message.model && <p className="mt-2 border-t border-slate-200/70 pt-2 text-[10px] text-slate-400 dark:border-slate-600">{message.model}{message.sources?.length ? " · " + message.sources.join(", ") : ""}</p>}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <LoaderCircle className="h-4 w-4 animate-spin text-emerald-600" />
                    Checking authorised ERP records and preparing an answer…
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((item) => (
                  <button key={item} type="button" onClick={() => void send(item)} disabled={busy} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-emerald-950/30">
                    {item}
                  </button>
                ))}
              </div>
              {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
              <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-500 dark:border-slate-700 dark:bg-slate-900">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Ask about sales, customer names, sale dates, invoices, products or stock…"
                  aria-label="Ask the ERP Assistant"
                  className="min-h-[54px] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 outline-none dark:text-slate-100"
                />
                <button type="button" onClick={() => void send()} disabled={!input.trim() || busy} aria-label="Send question" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40">
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">Enter to send · Shift + Enter for a new line · Assistant cannot modify or approve transactions</p>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">What you can ask</h2>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Sales totals for a date or period",
                  "Customer purchase and invoice history",
                  "Products sold on a particular date",
                  "Low stock and expiry information",
                  "Purchases by supplier",
                  "Branch and warehouse summaries",
                ].map((item) => <div key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{item}</div>)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Data protection</p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">The Assistant checks your signed-in company access before reading records. Responses are limited by your ERP role and branch permissions. Gemini is called securely from the server; the API key is not stored in browser code.</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

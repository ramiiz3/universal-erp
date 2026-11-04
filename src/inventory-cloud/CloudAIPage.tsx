import { useRef, useState } from "react"
import { Bot, LoaderCircle, Search, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"
import { buildCloudAIRequest, cloudAIProviderLabel } from "./cloudAI"

type Message = {
  id: string
  role: "user" | "assistant"
  text: string
  provider?: string
  model?: string
  counts?: Record<string, number>
}

const suggestions = [
  "Which products are low in stock and need restocking?",
  "Show the latest sales and unpaid invoices.",
  "Find invoices for a customer named Ahmed.",
  "Which products sold the most in the available sales records?",
  "Show pending purchase orders and quantities not yet received.",
]

export default function CloudAIPage() {
  const { activeCompany, user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome",
    role: "assistant",
    text: "Hello. I’m Zaki AI, your read-only business assistant. I can search the active company’s products, stock lots, movements, sales, invoices, payments, suppliers and purchase records that your account is authorised to view.",
  }])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const requestRef = useRef(false)

  async function sendMessage(preset?: string) {
    const message = (preset ?? input).trim()
    if (!message || busy || requestRef.current) return
    if (!supabase) {
      setError("The hosted Supabase connection is not configured.")
      return
    }
    if (!activeCompany?.companyId) {
      setError("Select an active company before asking Zaki AI.")
      return
    }

    requestRef.current = true
    setBusy(true)
    setError("")
    setInput("")

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: message,
    }
    setMessages((current) => [...current, userMessage])

    try {
      const history = messages
        .filter((item) => item.id !== "welcome")
        .slice(-8)
        .map(({ role, text }) => ({ role, text }))
      const body = buildCloudAIRequest(activeCompany.companyId, message, history)
      const { data, error: functionError } = await supabase.functions.invoke("zaki-ai", { body })

      if (functionError) {
        let detail = functionError.message
        const context = (functionError as unknown as { context?: unknown }).context
        if (context instanceof Response) {
          try {
            const responseBody = await context.clone().json() as { error?: unknown }
            if (typeof responseBody.error === "string") detail = responseBody.error
          } catch {
            // Preserve the Supabase Functions error if the response is not JSON.
          }
        }
        throw new Error(detail || "Zaki AI request failed.")
      }
      if (typeof data?.reply !== "string" || !data.reply.trim()) {
        throw new Error("Zaki AI returned an empty answer.")
      }

      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.reply,
        provider: typeof data.provider === "string" ? data.provider : undefined,
        model: typeof data.model === "string" ? data.model : undefined,
        counts: data.counts && typeof data.counts === "object"
          ? data.counts as Record<string, number>
          : undefined,
      }])
      if (Array.isArray(data.notices) && data.notices.length) {
        setError(data.notices.filter((value: unknown) => typeof value === "string").join(" "))
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to complete the Zaki AI request.")
    } finally {
      requestRef.current = false
      setBusy(false)
    }
  }

  const lastAnswer = [...messages].reverse().find((item) => item.role === "assistant" && item.provider)

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-emerald-100 p-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><Sparkles className="h-5 w-5" /></span>
            <h1 className="text-2xl font-semibold">Zaki AI</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Search and analyse live records for {activeCompany?.companyName ?? "your active company"}.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <ShieldCheck className="h-4 w-4" /> Read-only · Company and branch permissions
        </div>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Zaki searches the cloud ERP database using your signed-in account permissions. The relevant records and your question are sent to Gemini, or to OpenRouter’s free-model service if Gemini is unavailable. Avoid including unnecessary sensitive personal or medical information.
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6" aria-live="polite">
            {messages.map((item) => (
              <div key={item.id} className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                {item.role === "assistant" && (
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "user" ? "bg-emerald-700 text-white" : "border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"}`}>
                  {item.role === "assistant" && item.provider && (
                    <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                      {cloudAIProviderLabel(item.provider)}
                      {item.model && <span className="font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">{item.model}</span>}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{item.text}</p>
                  {item.counts && (
                    <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Records supplied: {Object.entries(item.counts).filter(([, count]) => count > 0).map(([name, count]) => `${name} ${count}`).join(" · ") || "No matching rows"}
                    </p>
                  )}
                </div>
                {item.role === "user" && (
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    <UserRound className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Searching authorised ERP records…
              </div>
            )}
          </div>

          {error && <div role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{error}</div>}

          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy}
                  onClick={() => void sendMessage(suggestion)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-emerald-500 hover:text-emerald-800 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:text-emerald-300"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => { event.preventDefault(); void sendMessage() }}
              className="flex items-end gap-2 rounded-xl border border-slate-300 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950"
            >
              <label className="sr-only" htmlFor="zaki-cloud-question">Ask Zaki AI</label>
              <textarea
                id="zaki-cloud-question"
                rows={2}
                maxLength={4_000}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                placeholder="Search your company’s sales, stock, invoices, suppliers or purchases…"
                className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim() || !user}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white disabled:opacity-40"
                aria-label="Send question"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <p className="mt-2 text-center text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 font-semibold"><Search className="h-4 w-4 text-emerald-700" /> Available cloud data</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li>Products, SKUs and barcodes</li>
              <li>Inventory lots, batch and expiry</li>
              <li>Stock movement history</li>
              <li>Sales, invoices and payments</li>
              <li>Suppliers and purchase orders</li>
              <li>Goods-receipt quantities and costs</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Provider status</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Gemini is the primary model. OpenRouter’s free-model router is used when Gemini is unavailable.</p>
            {lastAnswer?.provider && <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-300">Last response: {cloudAIProviderLabel(lastAnswer.provider)}</p>}
          </div>
        </aside>
      </div>
    </section>
  )
}

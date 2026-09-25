import { useMemo, useState } from "react"
import {
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react"
import { useERP } from "../context/ERPContext"
import { getERPSettings } from "../lib/erpSettings"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
}

const AI_SERVER =
  import.meta.env.VITE_AI_SERVER_URL ||
  "http://localhost:8787"

export default function AI() {
  const {
    products,
    inventoryLots,
    customers,
    sales,
    purchases,
  } = useERP()

  const settings = getERPSettings()

  const [messages, setMessages] =
    useState<ChatMessage[]>([
      {
        id: "welcome",
        role: "assistant",
        text:
          "Hello. I’m Zaki AI. Ask me about sales, inventory, products, customers, suppliers or invoices.",
      },
    ])

  const [input, setInput] =
    useState("")

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState("")

  const [previousInteractionId, setPreviousInteractionId] =
    useState<string | null>(null)

  const snapshot = useMemo(
    () => ({
      products,
      inventoryLots,
      customers,
      sales,
      purchases,
      settings,
    }),
    [
      products,
      inventoryLots,
      customers,
      sales,
      purchases,
      settings,
    ],
  )

  async function sendMessage(
    preset?: string,
  ) {
    const message =
      (preset ?? input).trim()

    if (!message || loading) return

    setError("")

    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: message,
      },
    ])

    setInput("")
    setLoading(true)

    try {
      const response = await fetch(
        `${AI_SERVER}/api/ai`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            message,
            snapshot,
            previousInteractionId,
          }),
        },
      )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ||
            "AI request failed.",
        )
      }

      if (data.interactionId) {
        setPreviousInteractionId(
          data.interactionId,
        )
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text:
            data.reply ||
            "I completed the request.",
        },
      ])
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to reach Zaki AI."

      setError(message)

      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text:
            "I couldn't connect to the AI service. The AI server needs to be running and configured.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="min-h-full bg-slate-50 p-4 md:p-6 dark:bg-[#0d1510]">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Zaki AI
              </h1>

              <p className="text-sm text-slate-500 dark:text-slate-400">
                Intelligent UniversalERP assistant
              </p>
            </div>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            ERP Agent
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[650px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
            <div className="flex-1 overflow-y-auto p-5 md:p-7">
              <div className="mx-auto max-w-4xl space-y-5">
                {messages.map(
                  (message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                          message.role ===
                          "user"
                            ? "bg-emerald-600 text-white"
                            : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {message.role ===
                          "assistant" && (
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <Bot className="h-3.5 w-3.5" />
                            Zaki AI
                          </div>
                        )}

                        <div className="whitespace-pre-wrap">
                          {message.text}
                        </div>
                      </div>
                    </div>
                  ),
                )}

                {loading && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Zaki AI is working...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="border-t border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="border-t border-slate-200 p-4 dark:border-slate-700">
              <div className="mx-auto max-w-4xl">
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    "Show today's sales.",
                    "Which products are low in stock?",
                    "Which products are expiring soon?",
                    "Find Ahmed Khan's invoices.",
                  ].map(
                    (suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() =>
                          sendMessage(
                            suggestion,
                          )
                        }
                        disabled={loading}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {suggestion}
                      </button>
                    ),
                  )}
                </div>

                <div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
                  <textarea
                    value={input}
                    onChange={(event) =>
                      setInput(
                        event.target.value,
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key ===
                          "Enter" &&
                        !event.shiftKey
                      ) {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                    rows={2}
                    placeholder="Ask Zaki AI about your pharmacy..."
                    className="min-h-[54px] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      sendMessage()
                    }
                    disabled={
                      loading ||
                      !input.trim()
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-center text-[11px] text-slate-400">
                  Enter to send • Shift+Enter for a new line
                </p>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />

                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  AI Capabilities
                </h2>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  "Sales analysis",
                  "Inventory analysis",
                  "Customer lookup",
                  "Invoice lookup",
                  "Supplier lookup",
                  "Expiry alerts",
                  "Low-stock alerts",
                  "ERP navigation",
                ].map(
                  (item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {item}
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#111a15]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Zaki Pharmacy
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {settings.businessName}
              </p>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {settings.emirate},{" "}
                {settings.country}
              </p>

              <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Zaki AI reads the current ERP data sent from your application. External actions such as sending an invoice will require an explicit confirmation step.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

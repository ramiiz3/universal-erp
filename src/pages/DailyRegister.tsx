import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Plus,
  Wallet,
} from "lucide-react"
import { useERP } from "../context/ERPContext"
import { createERPBackup, downloadJsonFile, validateERPBackup } from "../lib/erpBackup"
import { getBusinessDate, type DailyRegisterSession } from "../lib/dailyRegister"

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

function formatBusinessDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function Metric({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className={strong ? "text-sm font-semibold text-slate-900 dark:text-white" : "text-sm text-slate-600 dark:text-slate-300"}>{label}</span>
      <span className={strong ? "text-sm font-bold text-slate-900 dark:text-white tabular-nums" : "text-sm font-medium text-slate-700 dark:text-slate-200 tabular-nums"}>{money(value)}</span>
    </div>
  )
}

export default function DailyRegister() {
  const {
    dailyRegisters,
    dailyCashMovements,
    addDailyCashMovement,
    saveDailyCashReconciliation,
    getDailyRegisterSummary,
  } = useERP()

  const today = getBusinessDate()
  const initialRecord = dailyRegisters.find((item) => item.businessDate === today)
  const [businessDate, setBusinessDate] = useState(today)
  const [openingCash, setOpeningCash] = useState(initialRecord ? String(initialRecord.openingCash) : "")
  const [countedCash, setCountedCash] = useState(initialRecord?.countedCash === undefined ? "" : String(initialRecord.countedCash))
  const [reconciledBy, setReconciledBy] = useState(initialRecord?.closedBy ?? "")
  const [reconciliationNotes, setReconciliationNotes] = useState(initialRecord?.notes ?? "")
  const [movementKind, setMovementKind] = useState<"IN" | "OUT">("OUT")
  const [movementCategory, setMovementCategory] = useState("Expense")
  const [movementAmount, setMovementAmount] = useState("")
  const [movementNote, setMovementNote] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const existingRecord = dailyRegisters.find((item) => item.businessDate === businessDate)
  const existingReconciliation = dailyRegisters.find(
    (item) => item.businessDate === businessDate && item.status === "CLOSED" && item.countedCash !== undefined,
  )
  const hasOpeningFloat = openingCash.trim() !== "" && Number.isFinite(Number(openingCash)) && Number(openingCash) >= 0
  const summary = getDailyRegisterSummary(businessDate, hasOpeningFloat ? Number(openingCash) : 0)
  const selectedMovements = useMemo(
    () => dailyCashMovements.filter((item) => item.businessDate === businessDate),
    [dailyCashMovements, businessDate],
  )

  function changeBusinessDate(nextDate: string) {
    setBusinessDate(nextDate)
    const record = dailyRegisters.find((item) => item.businessDate === nextDate)
    setOpeningCash(record ? String(record.openingCash) : "")
    setCountedCash(record?.countedCash === undefined ? "" : String(record.countedCash))
    setReconciledBy(record?.closedBy ?? "")
    setReconciliationNotes(record?.notes ?? "")
    setError("")
    setSuccess("")
  }

  function saveCashMovement() {
    setError("")
    setSuccess("")
    try {
      addDailyCashMovement({
        businessDate,
        kind: movementKind,
        category: movementCategory,
        amount: Number(movementAmount),
        note: movementNote,
      })
      setMovementAmount("")
      setMovementNote("")
      setSuccess("Cash movement recorded for the selected date.")
    } catch (movementError) {
      setError(movementError instanceof Error ? movementError.message : "Could not record the cash movement.")
    }
  }

  function saveReconciliation() {
    setError("")
    setSuccess("")
    try {
      if (openingCash.trim() === "" || countedCash.trim() === "") {
        throw new Error("Enter both the opening cash float and the actual closing cash to reconcile the drawer.")
      }
      const saved = saveDailyCashReconciliation({
        businessDate,
        openingCash: Number(openingCash),
        countedCash: Number(countedCash),
        reconciledBy,
        notes: reconciliationNotes,
      })
      const difference = saved.cashDifference ?? 0
      setSuccess(
        difference === 0
          ? `Cash reconciled for ${businessDate}. The drawer matches the expected amount.`
          : `Cash reconciled for ${businessDate}. Difference: ${money(difference)}.`,
      )
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error ? reconciliationError.message : "Could not save the cash reconciliation.")
    }
  }

  function downloadBackupNow() {
    setError("")
    try {
      const backup = validateERPBackup(createERPBackup(localStorage))
      downloadJsonFile(`zaky-pharmacy-backup-${businessDate}.json`, backup)
      setSuccess("Full ERP backup downloaded. Copy it to a separate drive or secure cloud folder.")
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : "Could not download the ERP backup.")
    }
  }

  const recentRecords = [...dailyRegisters].sort((a, b) => b.businessDate.localeCompare(a.businessDate))

  return (
    <section className="min-h-full bg-slate-50 p-4 text-slate-900 dark:bg-[#0b120e] dark:text-slate-100 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-semibold tracking-tight">Daily Summary &amp; Cash Reconciliation</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Transactions are grouped by date automatically. There is no need to open or close a day.
            </p>
          </div>
          <button type="button" onClick={downloadBackupNow} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Download className="h-4 w-4" /> Download full backup
          </button>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold">Daily activity</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a date to view its sales, collections, refunds and supplier payments.</p>
          </div>
          <label className="block text-sm font-medium">
            Business date
            <input type="date" value={businessDate} max={today} onChange={(event) => changeBusinessDate(event.target.value)} className="mt-1 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 font-semibold">Sales · {formatBusinessDate(businessDate)}</h2>
            <Metric label={`Sales transactions (${summary.salesCount})`} value={summary.sales.total} strong />
            <Metric label="Cash sales" value={summary.sales.cash} />
            <Metric label="Card sales" value={summary.sales.card} />
            <Metric label="Bank transfer sales" value={summary.sales.bankTransfer} />
            <Metric label="Credit sales" value={summary.sales.credit} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 font-semibold">Other payments · {formatBusinessDate(businessDate)}</h2>
            <Metric label="Customer collections · cash" value={summary.customerCollections.cash} />
            <Metric label="Customer collections · card / bank" value={summary.customerCollections.card + summary.customerCollections.bankTransfer} />
            <Metric label="Sales refunds · cash" value={summary.refunds.cash} />
            <Metric label="Sales refunds · card / bank" value={summary.refunds.card + summary.refunds.bankTransfer} />
            <Metric label="Supplier payments · cash" value={summary.supplierPayments.cash} />
            <Metric label="Supplier payments · card / bank" value={summary.supplierPayments.card + summary.supplierPayments.bankTransfer} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Optional cash reconciliation</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Only use this when the pharmacy wants to compare the physical cash drawer with the ERP. The system cannot count physical cash automatically.
            </p>
            {existingReconciliation && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                Reconciled · Difference {money(existingReconciliation.cashDifference ?? 0)}
              </div>
            )}
            {existingRecord?.status === "OPEN" && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                This date has an older opening record. It no longer blocks sales. You can enter the actual cash count below to complete its reconciliation.
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Opening cash float (AED)
                <input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} placeholder="Amount at start of day" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="text-sm font-medium">Actual cash counted (AED)
                <input type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} placeholder="Amount counted at end" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
            </div>
            {hasOpeningFloat && (
              <div className="mt-3 rounded-xl bg-slate-100 p-4 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Expected cash in drawer</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{money(summary.expectedCash)}</p>
              </div>
            )}
            <label className="mt-3 block text-sm font-medium">Reconciled by (optional)
              <input value={reconciledBy} onChange={(event) => setReconciledBy(event.target.value)} placeholder="Cashier or manager" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="mt-3 block text-sm font-medium">Notes (optional)
              <textarea value={reconciliationNotes} onChange={(event) => setReconciliationNotes(event.target.value)} rows={2} placeholder="Explain any shortage, surplus or adjustment" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <button type="button" onClick={saveReconciliation} className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
              {existingReconciliation ? "Update reconciliation" : "Save reconciliation"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Other cash movements</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Record petty cash, expenses, cash deposits or owner cash movements. Sales, collections, refunds and supplier payments are included automatically.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMovementKind("IN")} className={`h-10 rounded-lg border text-sm font-semibold ${movementKind === "IN" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200"}`}>Cash received</button>
              <button type="button" onClick={() => setMovementKind("OUT")} className={`h-10 rounded-lg border text-sm font-semibold ${movementKind === "OUT" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200"}`}>Cash paid out</button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Category
                <select value={movementCategory} onChange={(event) => setMovementCategory(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option>Expense</option><option>Petty cash</option><option>Cash deposit</option><option>Owner cash movement</option><option>Other</option>
                </select>
              </label>
              <label className="text-sm font-medium">Amount (AED)
                <input type="number" min="0.01" step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} placeholder="0.00" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
            </div>
            <label className="mt-3 block text-sm font-medium">Reason / note
              <input value={movementNote} onChange={(event) => setMovementNote(event.target.value)} placeholder="What was this cash movement for?" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <button type="button" onClick={saveCashMovement} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Record cash movement
            </button>
            {selectedMovements.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <h3 className="mb-2 text-sm font-semibold">Movements · {formatBusinessDate(businessDate)}</h3>
                {selectedMovements.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3 py-1.5 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{item.category} · {item.note}</span>
                    <span className={item.kind === "IN" ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{item.kind === "IN" ? "+" : "−"} {money(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 font-semibold">Cash reconciliation history</h2>
          {recentRecords.length === 0 ? (
            <p className="text-sm text-slate-500">No cash reconciliations saved yet. Daily sales summaries are available above automatically.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800"><th className="py-2 pr-3">Business date</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Opening float</th><th className="py-2 pr-3 text-right">Sales</th><th className="py-2 pr-3 text-right">Expected cash</th><th className="py-2 pr-3 text-right">Counted cash</th><th className="py-2 text-right">Difference</th></tr></thead>
                <tbody>
                  {recentRecords.map((item: DailyRegisterSession) => {
                    const rowSummary = getDailyRegisterSummary(item.businessDate, item.openingCash)
                    const reconciled = item.status === "CLOSED" && item.countedCash !== undefined
                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td className="py-3 pr-3 font-medium">{item.businessDate}</td>
                        <td className="py-3 pr-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${reconciled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{reconciled ? "Reconciled" : "Not reconciled"}</span></td>
                        <td className="py-3 pr-3 text-right tabular-nums">{money(item.openingCash)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{money(rowSummary.sales.total)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{reconciled ? money(item.expectedCash ?? rowSummary.expectedCash) : "—"}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{item.countedCash === undefined ? "—" : money(item.countedCash)}</td>
                        <td className="py-3 text-right tabular-nums">{item.cashDifference === undefined ? "—" : money(item.cashDifference)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold">Protect your pharmacy records</p>
              <p className="mt-1">A cash reconciliation does not delete or lock transactions. A full backup can be downloaded at any time. Keep backup copies in a separate drive or secure cloud folder.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

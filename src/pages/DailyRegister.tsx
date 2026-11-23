import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Download,
  LockKeyhole,
  Plus,
  Wallet,
} from "lucide-react"
import { useERP } from "../context/ERPContext"
import { createERPBackup, downloadJsonFile, validateERPBackup } from "../lib/erpBackup"
import { getBusinessDate, type DailyRegisterSession } from "../lib/dailyRegister"

function money(value: number) {
  return `AED ${value.toFixed(2)}`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : value
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
    sales,
    customerPayments,
    salesReturns,
    supplierInvoices,
    openDailyRegister,
    addDailyCashMovement,
    closeDailyRegister,
    getDailyRegisterSummary,
  } = useERP()

  const today = getBusinessDate()
  const openRegister = dailyRegisters.find((item) => item.status === "OPEN")
  const closedToday = dailyRegisters.find((item) => item.businessDate === today && item.status === "CLOSED")
  const summary = openRegister ? getDailyRegisterSummary(openRegister) : closedToday?.summary

  const [openingCash, setOpeningCash] = useState("")
  const [openedBy, setOpenedBy] = useState("")
  const [closedBy, setClosedBy] = useState("")
  const [countedCash, setCountedCash] = useState("")
  const [closingNotes, setClosingNotes] = useState("")
  const [movementKind, setMovementKind] = useState<"IN" | "OUT">("OUT")
  const [movementCategory, setMovementCategory] = useState("Expense")
  const [movementAmount, setMovementAmount] = useState("")
  const [movementNote, setMovementNote] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const activeMovements = useMemo(
    () => openRegister
      ? dailyCashMovements.filter((item) => item.businessDate === openRegister.businessDate)
      : [],
    [dailyCashMovements, openRegister],
  )

  function startDay() {
    setError("")
    setSuccess("")
    try {
      const value = openingCash.trim() === "" ? Number.NaN : Number(openingCash)
      const register = openDailyRegister({ openingCash: value, openedBy })
      setOpeningCash("")
      setSuccess(`Register opened for ${register.businessDate}. You can now start POS sales.`)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open the cash register.")
    }
  }

  function saveCashMovement() {
    setError("")
    setSuccess("")
    try {
      addDailyCashMovement({
        kind: movementKind,
        category: movementCategory,
        amount: Number(movementAmount),
        note: movementNote,
      })
      setMovementAmount("")
      setMovementNote("")
      setSuccess(movementKind === "IN" ? "Cash received recorded." : "Cash paid out recorded.")
    } catch (movementError) {
      setError(movementError instanceof Error ? movementError.message : "Could not record the cash movement.")
    }
  }

  function closeDay() {
    setError("")
    setSuccess("")
    if (!openRegister) return
    const cashValue = countedCash.trim() === "" ? Number.NaN : Number(countedCash)
    if (!window.confirm("Close this day's register? New POS sales and cash transactions will be blocked until the next day's register is opened.")) return

    try {
      const closed = closeDailyRegister({ countedCash: cashValue, closedBy, notes: closingNotes })
      try {
        const backup = validateERPBackup(createERPBackup(localStorage))
        downloadJsonFile(`zaky-pharmacy-backup-${closed.businessDate}.json`, backup)
        setSuccess(`Day closed. Closing cash difference: ${money(closed.cashDifference ?? 0)}. A full ERP backup was downloaded.`)
      } catch (backupError) {
        setSuccess(`Day closed and saved. Backup download could not be started: ${backupError instanceof Error ? backupError.message : String(backupError)}. Please download a full backup from Settings now.`)
      }
      setCountedCash("")
      setClosingNotes("")
      setClosedBy("")
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Could not close the day.")
    }
  }

  function downloadBackupNow() {
    setError("")
    try {
      const backup = validateERPBackup(createERPBackup(localStorage))
      downloadJsonFile(`zaky-pharmacy-backup-${getBusinessDate()}.json`, backup)
      setSuccess("Full ERP backup downloaded. Copy it to a separate drive or secure cloud folder.")
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : "Could not download the ERP backup.")
    }
  }

  const todayClosed = !openRegister && Boolean(closedToday)
  const previousOpenDay = openRegister && openRegister.businessDate !== today

  return (
    <section className="min-h-full bg-slate-50 p-4 text-slate-900 dark:bg-[#0b120e] dark:text-slate-100 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="h-6 w-6 text-emerald-600" />
              <h1 className="text-2xl font-semibold tracking-tight">Daily Opening &amp; Closing</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open the cash register at the start of the day, reconcile it at closing, and keep every day's history.</p>
          </div>
          <button type="button" onClick={downloadBackupNow} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Download className="h-4 w-4" /> Download full backup
          </button>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>}

        {!openRegister && !todayClosed && (
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm dark:border-emerald-900 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold">Open today's register</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter the actual cash in the drawer before the first sale. This becomes the opening cash for today's reconciliation.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="block text-sm font-medium">Opening cash (AED)
                <input type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} placeholder="0.00" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <label className="block text-sm font-medium">Opened by (optional)
                <input value={openedBy} onChange={(event) => setOpenedBy(event.target.value)} placeholder="Cashier name" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              <button type="button" onClick={startDay} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">
                <Plus className="h-4 w-4" /> Open day
              </button>
            </div>
          </div>
        )}

        {todayClosed && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
              <LockKeyhole className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Today's register is closed</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Today's transactions are locked. Open a new register on the next business day. Previous sales and reports remain available.</p>
          </div>
        )}

        {openRegister && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Register open · {openRegister.businessDate}</div>
              <span>Opened {formatDate(openRegister.openedAt)} · Opening cash {money(openRegister.openingCash)}</span>
            </div>

            {previousOpenDay && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                The register for {openRegister.businessDate} is still open. Close that day before opening today's register. Today's POS transactions are locked until then.
              </div>
            )}

            {summary && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-2 font-semibold">Sales · {openRegister.businessDate}</h2>
                  <Metric label={`Sales transactions (${summary.salesCount})`} value={summary.sales.total} strong />
                  <Metric label="Cash sales" value={summary.sales.cash} />
                  <Metric label="Card sales" value={summary.sales.card} />
                  <Metric label="Bank transfer sales" value={summary.sales.bankTransfer} />
                  <Metric label="Credit sales" value={summary.sales.credit} />
                  <Metric label="Customer collections · cash" value={summary.customerCollections.cash} />
                  <Metric label="Customer collections · card / bank" value={summary.customerCollections.card + summary.customerCollections.bankTransfer} />
                  <Metric label="Sales refunds · cash" value={summary.refunds.cash} />
                  <Metric label="Sales refunds · card / bank" value={summary.refunds.card + summary.refunds.bankTransfer} />
                  <Metric label="Supplier payments · cash" value={summary.supplierPayments.cash} />
                  <Metric label="Supplier payments · card / bank" value={summary.supplierPayments.card + summary.supplierPayments.bankTransfer} />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-2 font-semibold">Cash drawer calculation</h2>
                  <Metric label="Opening cash" value={summary.openingCash} />
                  <Metric label="Add · cash sales" value={summary.sales.cash} />
                  <Metric label="Add · customer cash collections" value={summary.customerCollections.cash} />
                  <Metric label="Add · other cash received" value={summary.otherCashIn} />
                  <Metric label="Less · cash refunds" value={summary.refunds.cash} />
                  <Metric label="Less · supplier cash payments" value={summary.supplierPayments.cash} />
                  <Metric label="Less · other cash paid out" value={summary.otherCashOut} />
                  <div className="mt-3 rounded-xl bg-slate-100 p-4 dark:bg-slate-800">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Expected cash in drawer</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{money(summary.expectedCash)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-semibold">Record other cash movement</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use for petty cash and cash adjustments only. POS sales, customer collections, refunds and supplier invoice payments are counted automatically. Do not enter them again here.</p>
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
                {activeMovements.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <h3 className="mb-2 text-sm font-semibold">Other movements today</h3>
                    {activeMovements.map((item) => (
                      <div key={item.id} className="flex justify-between gap-3 py-1.5 text-sm">
                        <span className="text-slate-600 dark:text-slate-300">{item.category} · {item.note}</span>
                        <span className={item.kind === "IN" ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{item.kind === "IN" ? "+" : "−"} {money(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-900 dark:bg-slate-900">
                <div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-amber-600" /><h2 className="font-semibold">Close register · {openRegister.businessDate}</h2></div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Count all physical cash in the drawer and enter the actual amount. The ERP compares it with expected cash and records any difference.</p>
                <label className="mt-4 block text-sm font-medium">Actual cash counted (AED)
                  <input type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} placeholder="Count the drawer and enter the amount" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="mt-3 block text-sm font-medium">Closed by (optional)
                  <input value={closedBy} onChange={(event) => setClosedBy(event.target.value)} placeholder="Cashier name" className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="mt-3 block text-sm font-medium">Closing notes (optional)
                  <textarea value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} rows={3} placeholder="Explain any shortage, surplus or other note" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <button type="button" onClick={closeDay} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800">
                  <LockKeyhole className="h-4 w-4" /> Close day &amp; download backup
                </button>
              </div>
            </div>
          </>
        )}

        {closedToday && closedToday !== openRegister && summary && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">Today's closing result</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">Expected cash</p><p className="mt-1 text-lg font-bold">{money(closedToday.expectedCash ?? summary.expectedCash)}</p></div>
              <div><p className="text-xs text-slate-500">Cash counted</p><p className="mt-1 text-lg font-bold">{money(closedToday.countedCash ?? 0)}</p></div>
              <div><p className="text-xs text-slate-500">Difference (counted − expected)</p><p className={`mt-1 text-lg font-bold ${(closedToday.cashDifference ?? 0) === 0 ? "text-emerald-700" : "text-amber-700"}`}>{money(closedToday.cashDifference ?? 0)}</p></div>
            </div>
            {closedToday.notes && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Notes: {closedToday.notes}</p>}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 font-semibold">Previous days · closing history</h2>
          {dailyRegisters.length === 0 ? (
            <p className="text-sm text-slate-500">No register days have been opened yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800"><th className="py-2 pr-3">Business date</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Opening cash</th><th className="py-2 pr-3 text-right">Sales</th><th className="py-2 pr-3 text-right">Expected cash</th><th className="py-2 pr-3 text-right">Counted cash</th><th className="py-2 text-right">Difference</th></tr></thead>
                <tbody>
                  {dailyRegisters.map((item: DailyRegisterSession) => {
                    const rowSummary = item.status === "OPEN" ? getDailyRegisterSummary(item) : item.summary
                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td className="py-3 pr-3 font-medium">{item.businessDate}</td>
                        <td className="py-3 pr-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "OPEN" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{item.status}</span></td>
                        <td className="py-3 pr-3 text-right tabular-nums">{money(item.openingCash)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{money(rowSummary?.sales.total ?? 0)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{money(item.expectedCash ?? rowSummary?.expectedCash ?? 0)}</td>
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
              <p className="mt-1">Records are saved in this workstation's browser profile. Closing a day does not delete them, and a full backup is downloaded at each close. Copy backup files to a separate drive or secure cloud folder. Browser data can still be lost if the profile or device is damaged or cleared.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

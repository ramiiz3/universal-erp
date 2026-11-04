import { useState } from "react"
import {
  AlertTriangle,
  Download,
  FileCheck2,
  ShieldCheck,
  Upload,
} from "lucide-react"
import {
  createERPBackup,
  createMigrationInventoryReport,
  downloadJsonFile,
  getBackupDataWarnings,
  parseERPBackup,
  previewERPBackupRestore,
  restoreERPBackup,
  validateERPBackup,
  type ERPBackup,
  type MigrationInventoryReport,
} from "../lib/erpBackup"

type Props = {
  onRestored?: () => void
}

const COUNT_LABELS = [
  ["products", "Products"],
  ["inventoryLots", "Inventory lots"],
  ["stockMovements", "Stock movements"],
  ["customers", "Customers"],
  ["sales", "Sales"],
  ["invoices", "Invoices"],
  ["purchases", "Purchases"],
  ["suppliers", "Suppliers"],
  ["settingsRecords", "Settings records"],
  ["ownerProfileRecords", "Owner/profile records"],
  ["readNotificationRecords", "Read notification preferences"],
  ["otherStorageKeys", "Other localStorage keys (names only)"],
  ["storageKeys", "ERP backup keys"],
] as const

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function BackupRestorePanel({ onRestored }: Props) {
  const [backup, setBackup] = useState<ERPBackup | null>(null)
  const [createdBackup, setCreatedBackup] = useState<ERPBackup | null>(null)
  const [report, setReport] = useState<MigrationInventoryReport | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const restorePreview = backup
    ? previewERPBackupRestore(localStorage, backup)
    : null
  const backupWarnings = backup ? getBackupDataWarnings(backup) : []

  function createDownload() {
    setError("")
    setMessage("")
    try {
      const currentBackup = createERPBackup(localStorage)
      const validatedBackup = validateERPBackup(currentBackup)
      const timestamp = currentBackup.createdAt.replace(/[:.]/g, "-")
      downloadJsonFile(`universal-erp-backup-${timestamp}.json`, validatedBackup)
      setCreatedBackup(validatedBackup)
      setMessage(
        `Backup validated and downloaded. Created ${new Date(validatedBackup.createdAt).toLocaleString()} · App version ${validatedBackup.appVersion} · ${validatedBackup.counts.storageKeys} allowlisted ERP key(s) · ${formatBytes(
          new Blob([JSON.stringify(validatedBackup)]).size,
        )}.`,
      )
    } catch (backupError) {
      setError(
        `Could not create the backup. ${backupError instanceof Error ? backupError.message : String(backupError)}`,
      )
    }
  }

  async function handleBackupFile(file: File | undefined) {
    setError("")
    setMessage("")
    setBackup(null)
    setConfirmed(false)
    if (!file) return

    try {
      const parsed = parseERPBackup(await file.text())
      setBackup(parsed)
    } catch (parseError) {
      setError(
        `Backup validation failed. ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      )
    }
  }

  function handleRestore() {
    if (!backup || !confirmed) return
    const keyPreview = restorePreview
    const confirmation = window.confirm(
      `Replace only the ${keyPreview?.currentKeyCount ?? 0} current allowlisted ERP key(s) with this backup? Authentication sessions, Supabase client data, theme preference, recovery snapshots, and unrelated browser storage will remain unchanged.`,
    )
    if (!confirmation) return

    setError("")
    setMessage("")
    try {
      restoreERPBackup(localStorage, backup, true)
      if (onRestored) {
        onRestored()
        return
      }
      setMessage("Restore completed. Reload the page to use the restored ERP data.")
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : String(restoreError),
      )
    }
  }

  function createMigrationReport() {
    setError("")
    setMessage("")
    try {
      const currentReport = createMigrationInventoryReport(localStorage)
      setReport(currentReport)
    } catch (reportError) {
      setError(
        `Could not read the migration inventory. ${reportError instanceof Error ? reportError.message : String(reportError)}`,
      )
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 border-b border-slate-200 p-5">
          <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Full ERP Backup &amp; Restore</h2>
            <p className="mt-1 text-sm text-slate-500">
                Backs up ERP products, inventory, customers, sales, purchases, suppliers,
                business settings, owner profile, and read-notification preferences. Supabase
                sessions and tokens, OAuth credentials, theme preference, automatic recovery
                snapshots, and unrelated browser storage are excluded and never changed by restore.
              </p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={createDownload}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              Download Full Backup
            </button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Select Backup to Restore
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(event) => {
                  void handleBackupFile(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
            </label>
          </div>

          {message && (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          {createdBackup && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-sm font-semibold text-emerald-900">Backup contents</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {COUNT_LABELS.filter(([key]) => key !== "otherStorageKeys").map(([key, label]) => (
                  <div key={key} className="flex justify-between rounded-md bg-white px-3 py-2 text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-900">{createdBackup.counts[key]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {backup && restorePreview && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-emerald-700" />
                <h3 className="font-medium text-slate-900">Validated restore preview</h3>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Created {new Date(backup.createdAt).toLocaleString()} · App version {backup.appVersion} ·{" "}
                {backup.counts.storageKeys} allowlisted ERP key(s)
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {COUNT_LABELS.filter(([key]) => key !== "otherStorageKeys").map(([key, label]) => (
                  <div key={key} className="flex justify-between rounded-md bg-white px-3 py-2 text-sm">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-900">{backup.counts[key]}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-700">
                Current: {restorePreview.currentKeyCount} ERP key(s). Restore will overwrite{" "}
                {restorePreview.overwrittenKeys.length}, add {restorePreview.addedKeys.length}, and remove{" "}
                {restorePreview.removedKeys.length} allowlisted ERP key(s). All other browser storage is preserved.
              </p>
              {(restorePreview.overwrittenKeys.length > 0 || restorePreview.removedKeys.length > 0) && (
                <details className="mt-2 text-sm text-slate-600">
                  <summary className="cursor-pointer font-medium">Review affected storage keys</summary>
                  {restorePreview.overwrittenKeys.length > 0 && (
                    <p className="mt-2 break-all">
                      Overwritten: {restorePreview.overwrittenKeys.join(", ")}
                    </p>
                  )}
                  {restorePreview.removedKeys.length > 0 && (
                    <p className="mt-2 break-all">
                      Removed: {restorePreview.removedKeys.join(", ")}
                    </p>
                  )}
                </details>
              )}
              {backupWarnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Backup contains data-quality warnings
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900">
                    {backupWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
              <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-700"
                />
                <span>
                  I understand this replaces only the allowlisted ERP data and settings keys shown
                  in this preview. Authentication sessions, Supabase client data, theme preference,
                  recovery snapshots, and unrelated browser storage will remain unchanged.
                </span>
              </label>
              <button
                type="button"
                disabled={!confirmed}
                onClick={handleRestore}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Upload className="h-4 w-4" />
                Confirm ERP Restore
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900">Read-only Migration Inventory</h2>
          <p className="mt-1 text-sm text-slate-500">
            Reports existing IDs, invoice numbers, record counts, and broken references without
            changing local data.
          </p>
          <button
            type="button"
            onClick={createMigrationReport}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Generate Migration Inventory Report
          </button>
        </div>

        {report && (
          <div className="space-y-4 p-5">
            <p className="text-xs text-slate-500">
              Generated {new Date(report.generatedAt).toLocaleString()}. This report is a snapshot;
              generate it again after data changes.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {COUNT_LABELS.map(([key, label]) => (
                <div key={key} className="flex justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-semibold text-slate-900">{report.counts[key]}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => downloadJsonFile(
                  `universal-erp-migration-inventory-${report.generatedAt.replace(/[:.]/g, "-")}.json`,
                  report,
                )}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Download Report
              </button>
            </div>
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                Existing IDs and invoice numbers
              </summary>
              <div className="mt-3 space-y-3 text-xs text-slate-600">
                {Object.entries(report.ids).map(([category, ids]) => (
                  <p key={category} className="break-all">
                    <span className="font-semibold capitalize">{category}:</span>{" "}
                    {ids.length ? ids.join(", ") : "None"}
                  </p>
                ))}
                <p className="break-all">
                  <span className="font-semibold">Invoice numbers:</span>{" "}
                  {report.invoiceNumbers.length ? report.invoiceNumbers.join(", ") : "None"}
                </p>
              </div>
            </details>
            <details className="rounded-lg border border-slate-200 p-3" open={report.missingRelationships.length > 0}>
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                Missing relationships or invalid references ({report.missingRelationships.length})
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                {report.missingRelationships.length ? report.missingRelationships.map((issue, index) => (
                  <p key={`${issue.record}-${issue.field}-${index}`} className="rounded bg-amber-50 p-2 text-amber-900">
                    {issue.record} · {issue.field} “{issue.reference || "(missing)"}”: {issue.message}
                  </p>
                )) : <p className="text-slate-500">No missing references were detected.</p>}
              </div>
            </details>
            {report.dataWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <h3 className="text-sm font-semibold text-amber-900">Data warnings</h3>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900">
                  {report.dataWarnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                </ul>
              </div>
            )}
            {report.otherStorageKeys.length > 0 && (
              <p className="break-all text-sm text-slate-600">
                Other preserved storage keys: {report.otherStorageKeys.join(", ")}
              </p>
            )}
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                Data limitations
              </summary>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
                {report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
            </details>
          </div>
        )}
      </section>
    </div>
  )
}

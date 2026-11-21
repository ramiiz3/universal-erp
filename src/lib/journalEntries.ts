import type { ChartOfAccount } from "./chartOfAccounts"

export type JournalEntryStatus = "DRAFT" | "POSTED"

export type JournalEntryLineInput = {
  accountId: string
  description?: string
  debit: number
  credit: number
}

export type JournalEntryInput = {
  date: string
  reference?: string
  description: string
  lines: JournalEntryLineInput[]
}

export type JournalEntryLine = {
  id: string
  accountId: string
  description: string
  debit: number
  credit: number
}

export type JournalEntry = {
  id: string
  entryNumber: string
  date: string
  reference: string
  description: string
  lines: JournalEntryLine[]
  totalDebit: number
  totalCredit: number
  status: JournalEntryStatus
  createdAt: string
  postedAt: string | null
}

function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Debit and credit amounts must be valid non-negative numbers.")
  }

  if (Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new Error("Amounts cannot have more than two decimal places.")
  }

  return Math.round(value * 100)
}

function fromCents(value: number): number {
  return value / 100
}

export function validateJournalEntryInput(
  input: JournalEntryInput,
  accounts: readonly ChartOfAccount[],
): JournalEntryInput {
  const date = String(input.date ?? "").trim()
  const description = String(input.description ?? "").trim()
  const reference = String(input.reference ?? "").trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Enter a valid journal entry date.")
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`)
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Enter a valid journal entry date.")
  }

  if (!description) {
    throw new Error("Journal description is required.")
  }

  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new Error("A journal entry requires at least two lines.")
  }

  const lines = input.lines.map((line): JournalEntryLineInput => {
    const account = accounts.find((item) => item.id === line.accountId)

    if (!account || account.status !== "ACTIVE") {
      throw new Error("Every journal line must use an active account.")
    }

    const debitCents = toCents(line.debit)
    const creditCents = toCents(line.credit)

    if ((debitCents > 0) === (creditCents > 0)) {
      throw new Error("Each journal line must contain either a debit or a credit, not both.")
    }

    return {
      accountId: line.accountId,
      description: String(line.description ?? "").trim(),
      debit: fromCents(debitCents),
      credit: fromCents(creditCents),
    }
  })

  return { date, reference, description, lines }
}

export function buildJournalEntry(
  input: JournalEntryInput,
  accounts: readonly ChartOfAccount[],
  existing: readonly JournalEntry[],
  now = new Date(),
): JournalEntry {
  const normalized = validateJournalEntryInput(input, accounts)

  const year = normalized.date.slice(0, 4)
  const existingNumbers = existing
    .filter((entry) => entry.entryNumber.startsWith(`JE-${year}-`))
    .map((entry) => Number(entry.entryNumber.slice(`JE-${year}-`.length)))
    .filter(Number.isSafeInteger)

  const sequence = Math.max(0, ...existingNumbers) + 1

  const lines: JournalEntryLine[] = normalized.lines.map((line, index) => ({
    ...line,
    description: line.description ?? "",
    id: `JRL-${now.getTime()}-${index + 1}-${sequence}`,
  }))

  const totalDebit = fromCents(
    lines.reduce((sum, line) => sum + toCents(line.debit), 0),
  )

  const totalCredit = fromCents(
    lines.reduce((sum, line) => sum + toCents(line.credit), 0),
  )

  return {
    id: `JRN-${now.getTime()}-${sequence}`,
    entryNumber: `JE-${year}-${String(sequence).padStart(4, "0")}`,
    date: normalized.date,
    reference: normalized.reference ?? "",
    description: normalized.description,
    lines,
    totalDebit,
    totalCredit,
    status: "DRAFT",
    createdAt: now.toISOString(),
    postedAt: null,
  }
}

export function validateJournalEntryForPosting(
  entry: JournalEntry,
  accounts: readonly ChartOfAccount[],
): void {
  if (entry.status !== "DRAFT") {
    throw new Error("Only draft journal entries can be posted.")
  }

  const normalized = validateJournalEntryInput(
    {
      date: entry.date,
      reference: entry.reference,
      description: entry.description,
      lines: entry.lines,
    },
    accounts,
  )

  const debitCents = normalized.lines.reduce(
    (sum, line) => sum + toCents(line.debit),
    0,
  )

  const creditCents = normalized.lines.reduce(
    (sum, line) => sum + toCents(line.credit),
    0,
  )

  if (debitCents <= 0 || creditCents <= 0) {
    throw new Error("A journal entry must contain both debit and credit amounts.")
  }

  if (debitCents !== creditCents) {
    throw new Error("Journal entry is not balanced. Total debits must equal total credits.")
  }
}

export function postJournalEntry(
  entry: JournalEntry,
  accounts: readonly ChartOfAccount[],
  now = new Date(),
): JournalEntry {
  validateJournalEntryForPosting(entry, accounts)

  return {
    ...entry,
    status: "POSTED",
    postedAt: now.toISOString(),
  }
}

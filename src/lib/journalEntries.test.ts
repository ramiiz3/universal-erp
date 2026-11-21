import { describe, expect, it } from "vitest"
import {
  buildJournalEntry,
  postJournalEntry,
  validateJournalEntryForPosting,
  validateJournalEntryInput,
  type JournalEntryInput,
} from "./journalEntries"
import { DEFAULT_CHART_OF_ACCOUNTS } from "./chartOfAccounts"

const accounts = DEFAULT_CHART_OF_ACCOUNTS
const cash = accounts.find((account) => account.code === "1000")!
const revenue = accounts.find((account) => account.code === "4000")!

const now = new Date("2026-11-21T10:00:00.000Z")

const balancedInput: JournalEntryInput = {
  date: "2026-11-21",
  reference: "INV-001",
  description: "Record customer cash sale",
  lines: [
    { accountId: cash.id, debit: 1000, credit: 0 },
    { accountId: revenue.id, debit: 0, credit: 1000 },
  ],
}

describe("journal entries", () => {
  it("validates and normalizes a valid journal entry", () => {
    const result = validateJournalEntryInput(balancedInput, accounts)

    expect(result.description).toBe("Record customer cash sale")
    expect(result.lines).toHaveLength(2)
  })

  it("creates a draft journal entry", () => {
    const entry = buildJournalEntry(balancedInput, accounts, [], now)

    expect(entry.entryNumber).toBe("JE-2026-0001")
    expect(entry.status).toBe("DRAFT")
    expect(entry.totalDebit).toBe(1000)
    expect(entry.totalCredit).toBe(1000)
    expect(entry.postedAt).toBeNull()
  })

  it("generates sequential journal numbers", () => {
    const first = buildJournalEntry(balancedInput, accounts, [], now)
    const second = buildJournalEntry(
      { ...balancedInput, reference: "INV-002" },
      accounts,
      [first],
      now,
    )

    expect(second.entryNumber).toBe("JE-2026-0002")
  })

  it("allows an unbalanced entry to remain a draft", () => {
    const input = {
      ...balancedInput,
      lines: [
        { accountId: cash.id, debit: 1000, credit: 0 },
        { accountId: revenue.id, debit: 0, credit: 800 },
      ],
    }

    const entry = buildJournalEntry(input, accounts, [], now)

    expect(entry.status).toBe("DRAFT")
    expect(entry.totalDebit).not.toBe(entry.totalCredit)
    expect(() => validateJournalEntryForPosting(entry, accounts)).toThrow(/not balanced/i)
  })

  it("rejects missing or inactive accounts", () => {
    expect(() => validateJournalEntryInput({
      ...balancedInput,
      lines: [
        { accountId: "missing", debit: 100, credit: 0 },
        { accountId: revenue.id, debit: 0, credit: 100 },
      ],
    }, accounts)).toThrow(/active account/i)

    const inactiveAccounts = accounts.map((account) =>
      account.id === cash.id ? { ...account, status: "INACTIVE" as const } : account,
    )

    expect(() => validateJournalEntryInput(balancedInput, inactiveAccounts))
      .toThrow(/active account/i)
  })

  it("rejects a line containing both debit and credit", () => {
    expect(() => validateJournalEntryInput({
      ...balancedInput,
      lines: [
        { accountId: cash.id, debit: 100, credit: 50 },
        { accountId: revenue.id, debit: 0, credit: 50 },
      ],
    }, accounts)).toThrow(/either a debit or a credit/i)
  })

  it("rejects negative and over-precision amounts", () => {
    expect(() => validateJournalEntryInput({
      ...balancedInput,
      lines: [
        { accountId: cash.id, debit: -10, credit: 0 },
        { accountId: revenue.id, debit: 0, credit: 1000 },
      ],
    }, accounts)).toThrow(/non-negative/i)

    expect(() => validateJournalEntryInput({
      ...balancedInput,
      lines: [
        { accountId: cash.id, debit: 10.123, credit: 0 },
        { accountId: revenue.id, debit: 0, credit: 10.123 },
      ],
    }, accounts)).toThrow(/two decimal places/i)
  })

  it("rejects journal entries with fewer than two lines", () => {
    expect(() => validateJournalEntryInput({
      ...balancedInput,
      lines: [balancedInput.lines[0]],
    }, accounts)).toThrow(/at least two lines/i)
  })

  it("rejects posting an entry without both sides", () => {
    const entry = buildJournalEntry({
      ...balancedInput,
      lines: [
        { accountId: cash.id, debit: 100, credit: 0 },
        { accountId: revenue.id, debit: 50, credit: 0 },
      ],
    }, accounts, [], now)

    expect(() => validateJournalEntryForPosting(entry, accounts))
      .toThrow(/must contain both debit and credit amounts/i)
  })

  it("posts a balanced journal entry", () => {
    const draft = buildJournalEntry(balancedInput, accounts, [], now)
    const posted = postJournalEntry(draft, accounts, now)

    expect(posted.status).toBe("POSTED")
    expect(posted.postedAt).toBe(now.toISOString())
    expect(draft.status).toBe("DRAFT")
  })

  it("does not allow an already posted entry to be posted again", () => {
    const draft = buildJournalEntry(balancedInput, accounts, [], now)
    const posted = postJournalEntry(draft, accounts, now)

    expect(() => postJournalEntry(posted, accounts, now))
      .toThrow(/only draft/i)
  })

  it("rejects invalid journal dates and missing descriptions", () => {
    expect(() => validateJournalEntryInput({
      ...balancedInput,
      date: "2026-02-30",
    }, accounts)).toThrow(/valid journal entry date/i)

    expect(() => validateJournalEntryInput({
      ...balancedInput,
      description: " ",
    }, accounts)).toThrow(/description is required/i)
  })
})

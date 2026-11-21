import { describe, expect, it } from "vitest"
import {
  buildChartOfAccount,
  CHART_ACCOUNT_GROUPS,
  DEFAULT_CHART_OF_ACCOUNTS,
  validateChartAccountStatus,
  validateChartOfAccountInput,
  type ChartOfAccount,
  type ChartOfAccountInput,
} from "./chartOfAccounts"

const input: ChartOfAccountInput = {
  code: "6100", name: "Telephone Expense", type: "EXPENSE",
  group: "OPERATING_EXPENSE", description: "Monthly telephone charges",
}
const fixedNow = new Date("2026-11-21T10:00:00.000Z")

function customAccount(overrides: Partial<ChartOfAccount> = {}): ChartOfAccount {
  return {
    id: "ACC-PARENT", code: "6000", name: "Operating Expenses", type: "EXPENSE",
    group: "OPERATING_EXPENSE", parentId: null, description: "", isSystem: false,
    status: "ACTIVE", createdAt: fixedNow.toISOString(), ...overrides,
  }
}

describe("chart of accounts", () => {
  it("seeds a balanced set of account structures across the five account types", () => {
    expect(new Set(DEFAULT_CHART_OF_ACCOUNTS.map((account) => account.code)).size).toBe(DEFAULT_CHART_OF_ACCOUNTS.length)
    expect(new Set(DEFAULT_CHART_OF_ACCOUNTS.map((account) => account.type))).toEqual(new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]))
    expect(DEFAULT_CHART_OF_ACCOUNTS.every((account) => account.isSystem && account.status === "ACTIVE")).toBe(true)
  })

  it("normalizes account code and text", () => {
    const result = validateChartOfAccountInput({ ...input, code: " 6100 ", name: " Telephone Expense " }, [])
    expect(result.code).toBe("6100")
    expect(result.name).toBe("Telephone Expense")
  })

  it("rejects duplicate codes case-insensitively", () => {
    expect(() => validateChartOfAccountInput(input, [customAccount({ code: "6100" })])).toThrow(/already in use/i)
  })

  it("rejects invalid account codes", () => {
    expect(() => validateChartOfAccountInput({ ...input, code: "1" }, [])).toThrow(/account code/i)
  })

  it("rejects empty account names", () => {
    expect(() => validateChartOfAccountInput({ ...input, name: " " }, [])).toThrow(/name is required/i)
  })

  it("restricts groups to the selected account type", () => {
    expect(() => validateChartOfAccountInput({ ...input, group: "CURRENT_ASSET" as ChartOfAccountInput["group"] }, [])).toThrow(/does not match/i)
    expect(Object.keys(CHART_ACCOUNT_GROUPS)).toHaveLength(5)
  })

  it("requires an active parent of the same account type", () => {
    expect(() => validateChartOfAccountInput({ ...input, parentId: "missing" }, [])).toThrow(/active parent/i)
    expect(() => validateChartOfAccountInput({ ...input, parentId: "parent" }, [customAccount({ id: "parent", type: "ASSET", group: "CURRENT_ASSET" })])).toThrow(/same account type/i)
  })

  it("rejects self-parenting and descendant cycles", () => {
    const parent = customAccount({ id: "parent" })
    expect(() => validateChartOfAccountInput({ ...input, parentId: "parent" }, [parent], "parent")).toThrow(/own parent/i)
    const child = customAccount({ id: "child", code: "6010", name: "Child", parentId: "parent" })
    expect(() => validateChartOfAccountInput({ ...input, parentId: "child" }, [parent, child], "parent")).toThrow(/descendants/i)
  })

  it("builds a custom active account with a generated id", () => {
    const result = buildChartOfAccount(input, [], fixedNow)
    expect(result.id).toBe("ACC-1795255200000-1")
    expect(result.isSystem).toBe(false)
    expect(result.status).toBe("ACTIVE")
  })

  it("protects system accounts from deactivation", () => {
    expect(() => validateChartAccountStatus(DEFAULT_CHART_OF_ACCOUNTS[0], "INACTIVE", DEFAULT_CHART_OF_ACCOUNTS)).toThrow(/system accounts/i)
  })

  it("prevents deactivating a parent with active children", () => {
    const parent = customAccount()
    const child = customAccount({ id: "child", code: "6010", name: "Child", parentId: parent.id })
    expect(() => validateChartAccountStatus(parent, "INACTIVE", [parent, child])).toThrow(/active child/i)
  })

  it("allows deactivation of a custom leaf account", () => {
    expect(() => validateChartAccountStatus(customAccount(), "INACTIVE", [customAccount()])).not.toThrow()
  })
})

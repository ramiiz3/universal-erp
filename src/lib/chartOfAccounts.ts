export type ChartAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"

export type ChartAccountGroup =
  | "CURRENT_ASSET" | "NON_CURRENT_ASSET"
  | "CURRENT_LIABILITY" | "NON_CURRENT_LIABILITY"
  | "OWNER_EQUITY" | "RETAINED_EARNINGS" | "DRAWINGS"
  | "OPERATING_REVENUE" | "OTHER_INCOME" | "CONTRA_REVENUE"
  | "COST_OF_SALES" | "OPERATING_EXPENSE" | "OTHER_EXPENSE"

export type ChartAccountStatus = "ACTIVE" | "INACTIVE"

export type ChartOfAccount = {
  id: string
  code: string
  name: string
  type: ChartAccountType
  group: ChartAccountGroup
  parentId: string | null
  description: string
  isSystem: boolean
  status: ChartAccountStatus
  createdAt: string
}

export type ChartOfAccountInput = {
  code: string
  name: string
  type: ChartAccountType
  group: ChartAccountGroup
  parentId?: string | null
  description?: string
}

export const CHART_ACCOUNT_TYPES: readonly ChartAccountType[] = [
  "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE",
]

export const CHART_ACCOUNT_GROUPS: Record<ChartAccountType, readonly ChartAccountGroup[]> = {
  ASSET: ["CURRENT_ASSET", "NON_CURRENT_ASSET"],
  LIABILITY: ["CURRENT_LIABILITY", "NON_CURRENT_LIABILITY"],
  EQUITY: ["OWNER_EQUITY", "RETAINED_EARNINGS", "DRAWINGS"],
  REVENUE: ["OPERATING_REVENUE", "OTHER_INCOME", "CONTRA_REVENUE"],
  EXPENSE: ["COST_OF_SALES", "OPERATING_EXPENSE", "OTHER_EXPENSE"],
}

const SEED_DATE = "2026-01-01T00:00:00.000Z"

function systemAccount(
  code: string,
  name: string,
  type: ChartAccountType,
  group: ChartAccountGroup,
  description = "",
): ChartOfAccount {
  return {
    id: `SYS-${code}`,
    code,
    name,
    type,
    group,
    parentId: null,
    description,
    isSystem: true,
    status: "ACTIVE",
    createdAt: SEED_DATE,
  }
}

// Structure only: these accounts have no opening balances or journal postings.
export const DEFAULT_CHART_OF_ACCOUNTS: ChartOfAccount[] = [
  systemAccount("1000", "Cash on Hand", "ASSET", "CURRENT_ASSET"),
  systemAccount("1010", "Bank Current Account", "ASSET", "CURRENT_ASSET"),
  systemAccount("1100", "Accounts Receivable", "ASSET", "CURRENT_ASSET"),
  systemAccount("1200", "Inventory", "ASSET", "CURRENT_ASSET"),
  systemAccount("1300", "VAT Recoverable", "ASSET", "CURRENT_ASSET"),
  systemAccount("1500", "Property, Plant & Equipment", "ASSET", "NON_CURRENT_ASSET"),
  systemAccount("1590", "Accumulated Depreciation", "ASSET", "NON_CURRENT_ASSET"),
  systemAccount("2000", "Accounts Payable", "LIABILITY", "CURRENT_LIABILITY"),
  systemAccount("2100", "VAT Payable", "LIABILITY", "CURRENT_LIABILITY"),
  systemAccount("2200", "Customer Advances", "LIABILITY", "CURRENT_LIABILITY"),
  systemAccount("2300", "Accrued Expenses", "LIABILITY", "CURRENT_LIABILITY"),
  systemAccount("2500", "Long-term Liabilities", "LIABILITY", "NON_CURRENT_LIABILITY"),
  systemAccount("3000", "Owner's Capital", "EQUITY", "OWNER_EQUITY"),
  systemAccount("3100", "Retained Earnings", "EQUITY", "RETAINED_EARNINGS"),
  systemAccount("3200", "Owner Drawings", "EQUITY", "DRAWINGS"),
  systemAccount("4000", "Sales Revenue", "REVENUE", "OPERATING_REVENUE"),
  systemAccount("4100", "Sales Returns & Allowances", "REVENUE", "CONTRA_REVENUE"),
  systemAccount("4200", "Other Income", "REVENUE", "OTHER_INCOME"),
  systemAccount("5000", "Cost of Goods Sold", "EXPENSE", "COST_OF_SALES"),
  systemAccount("5100", "Salaries & Wages", "EXPENSE", "OPERATING_EXPENSE"),
  systemAccount("5200", "Rent Expense", "EXPENSE", "OPERATING_EXPENSE"),
  systemAccount("5300", "Utilities Expense", "EXPENSE", "OPERATING_EXPENSE"),
  systemAccount("5400", "Marketing Expense", "EXPENSE", "OPERATING_EXPENSE"),
  systemAccount("5500", "Bank Charges", "EXPENSE", "OTHER_EXPENSE"),
  systemAccount("5600", "Depreciation Expense", "EXPENSE", "OTHER_EXPENSE"),
  systemAccount("5700", "Other Operating Expenses", "EXPENSE", "OPERATING_EXPENSE"),
]

export function validateChartOfAccountInput(
  input: ChartOfAccountInput,
  existing: readonly ChartOfAccount[],
  excludeId?: string,
): ChartOfAccountInput {
  const normalized: ChartOfAccountInput = {
    code: String(input.code ?? "").trim().toUpperCase(),
    name: String(input.name ?? "").trim(),
    type: input.type,
    group: input.group,
    parentId: input.parentId || null,
    description: String(input.description ?? "").trim(),
  }

  if (!/^[A-Z0-9][A-Z0-9.-]{1,19}$/.test(normalized.code)) {
    throw new Error("Account code must be 2–20 characters and use letters, numbers, dots or hyphens.")
  }
  if (!normalized.name) throw new Error("Account name is required.")
  if (!CHART_ACCOUNT_TYPES.includes(normalized.type)) throw new Error("Select a valid account type.")
  if (!CHART_ACCOUNT_GROUPS[normalized.type].includes(normalized.group)) {
    throw new Error("The selected account group does not match the account type.")
  }
  if (existing.some((item) => item.id !== excludeId && item.code.toUpperCase() === normalized.code)) {
    throw new Error(`Account code ${normalized.code} is already in use.`)
  }

  if (normalized.parentId) {
    if (normalized.parentId === excludeId) throw new Error("An account cannot be its own parent.")
    const parent = existing.find((item) => item.id === normalized.parentId)
    if (!parent || parent.status !== "ACTIVE") throw new Error("Select an active parent account.")
    if (parent.type !== normalized.type) throw new Error("Parent and child accounts must have the same account type.")

    let cursor: ChartOfAccount | undefined = parent
    const visited = new Set<string>()
    while (cursor) {
      if (cursor.id === excludeId) throw new Error("An account cannot be moved beneath one of its descendants.")
      if (visited.has(cursor.id)) throw new Error("The selected account hierarchy contains a cycle.")
      visited.add(cursor.id)
      cursor = cursor.parentId ? existing.find((item) => item.id === cursor!.parentId) : undefined
    }
  }

  return normalized
}

export function buildChartOfAccount(
  input: ChartOfAccountInput,
  existing: readonly ChartOfAccount[],
  now = new Date(),
): ChartOfAccount {
  const normalized = validateChartOfAccountInput(input, existing)
  return {
    ...normalized,
    id: `ACC-${now.getTime()}-${existing.length + 1}`,
    parentId: normalized.parentId ?? null,
    description: normalized.description ?? "",
    isSystem: false,
    status: "ACTIVE",
    createdAt: now.toISOString(),
  }
}

export function validateChartAccountStatus(
  account: ChartOfAccount,
  nextStatus: ChartAccountStatus,
  existing: readonly ChartOfAccount[],
): void {
  if (nextStatus === "INACTIVE" && account.isSystem) {
    throw new Error("System accounts cannot be deactivated.")
  }
  if (nextStatus === "INACTIVE") {
    const descendants = new Set<string>([account.id])
    let foundActiveDescendant = false
    let changed = true
    while (changed) {
      changed = false
      for (const item of existing) {
        if (item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
          if (item.status === "ACTIVE") foundActiveDescendant = true
        }
      }
    }
    if (foundActiveDescendant) {
      throw new Error("Move or deactivate active child accounts before deactivating this parent.")
    }
  }
}

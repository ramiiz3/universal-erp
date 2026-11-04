export interface CompanyBranch {
  id: string
  name: string
  is_default: boolean
}

export interface BranchDraft {
  companyId: string
  name: string
  createdBy: string
}

export interface BranchPersistence {
  insert(
    draft: BranchDraft,
  ): Promise<{ data: CompanyBranch | null; error: { code?: string; message: string } | null }>
  findExisting(
    companyId: string,
    name: string,
  ): Promise<{ data: CompanyBranch | null; error: { message: string } | null }>
}

export interface BranchCreationResult {
  branch: CompanyBranch
  created: boolean
}

export interface CompanyMember {
  membershipId: string
  userId: string
  fullName: string
  email: string
  roleKey: string
  roleName: string
  branchId: string | null
  branchName: string | null
  status: string
}

type CompanyMemberRow = Record<string, unknown>

const pendingBranchCreations = new Map<string, Promise<BranchCreationResult>>()

export function createBranchOnce(
  draft: BranchDraft,
  persistence: BranchPersistence,
): Promise<BranchCreationResult> {
  const name = draft.name.trim()
  const key = `${draft.companyId}:${name}`
  const pending = pendingBranchCreations.get(key)
  if (pending) return pending

  const creation = (async () => {
    const result = await persistence.insert({ ...draft, name })
    if (!result.error && result.data) return { branch: result.data, created: true }

    if (result.error?.code === "23505") {
      const existing = await persistence.findExisting(draft.companyId, name)
      if (existing.error) throw new Error(existing.error.message)
      if (existing.data) return { branch: existing.data, created: false }
    }

    throw new Error(result.error?.message ?? "The database did not confirm branch creation.")
  })()

  pendingBranchCreations.set(key, creation)
  void creation.finally(() => {
    if (pendingBranchCreations.get(key) === creation) pendingBranchCreations.delete(key)
  }).catch(() => undefined)
  return creation
}

export function mapCompanyMembers(rows: readonly CompanyMemberRow[]): CompanyMember[] {
  return rows.map((row) => ({
    membershipId: String(row.membership_id),
    userId: String(row.user_id),
    fullName: typeof row.full_name === "string" && row.full_name.trim()
      ? row.full_name
      : "Name unavailable",
    email: typeof row.email === "string" && row.email.trim()
      ? row.email
      : "Email unavailable",
    roleKey: String(row.role_key ?? ""),
    roleName: String(row.role_name ?? "Member"),
    branchId: typeof row.branch_id === "string" ? row.branch_id : null,
    branchName: typeof row.branch_name === "string" ? row.branch_name : null,
    status: String(row.status ?? "unknown"),
  }))
}

import { describe, expect, it, vi } from "vitest"
import {
  createBranchOnce,
  mapCompanyMembers,
  type BranchPersistence,
} from "./workspaceManagement"

function persistence(insert: BranchPersistence["insert"]): BranchPersistence {
  return {
    insert,
    findExisting: vi.fn(async () => ({
      data: { id: "branch-existing", name: "Test Branch", is_default: false },
      error: null,
    })),
  }
}

describe("workspace management", () => {
  it("shares an in-flight branch creation between duplicate submissions", async () => {
    type InsertResult = Awaited<ReturnType<BranchPersistence["insert"]>>
    let resolveInsert: ((result: InsertResult) => void) | undefined
    const insert = vi.fn(() => new Promise<InsertResult>((resolve) => {
      resolveInsert = resolve
    }))
    const store = persistence(insert)
    const draft = { companyId: "company-a", name: " New Branch ", createdBy: "user-a" }

    const first = createBranchOnce(draft, store)
    const second = createBranchOnce(draft, store)

    expect(insert).toHaveBeenCalledTimes(1)
    resolveInsert?.({
      data: { id: "branch-new", name: "New Branch", is_default: false },
      error: null,
    })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { branch: { id: "branch-new", name: "New Branch", is_default: false }, created: true },
      { branch: { id: "branch-new", name: "New Branch", is_default: false }, created: true },
    ])
  })

  it("treats a database-confirmed duplicate retry as the existing branch", async () => {
    const store = persistence(vi.fn(async () => ({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    })))

    await expect(createBranchOnce(
      { companyId: "company-a", name: "Test Branch", createdBy: "user-a" },
      store,
    )).resolves.toEqual({
      branch: { id: "branch-existing", name: "Test Branch", is_default: false },
      created: false,
    })
    expect(store.findExisting).toHaveBeenCalledWith("company-a", "Test Branch")
  })

  it("maps member identity, role, branch and status and tolerates missing profile data", () => {
    expect(mapCompanyMembers([
      {
        membership_id: "membership-a",
        user_id: "user-a",
        full_name: "Member A",
        email: "member-a@example.test",
        role_key: "inventory_manager",
        role_name: "Inventory Manager",
        branch_id: "branch-a",
        branch_name: "Main",
        status: "active",
      },
      {
        membership_id: "membership-b",
        user_id: "user-b",
        full_name: null,
        email: null,
        role_key: "cashier",
        role_name: "Cashier",
        branch_id: null,
        branch_name: null,
        status: "revoked",
      },
    ])).toEqual([
      {
        membershipId: "membership-a",
        userId: "user-a",
        fullName: "Member A",
        email: "member-a@example.test",
        roleKey: "inventory_manager",
        roleName: "Inventory Manager",
        branchId: "branch-a",
        branchName: "Main",
        status: "active",
      },
      {
        membershipId: "membership-b",
        userId: "user-b",
        fullName: "Name unavailable",
        email: "Email unavailable",
        roleKey: "cashier",
        roleName: "Cashier",
        branchId: null,
        branchName: null,
        status: "revoked",
      },
    ])
  })
})

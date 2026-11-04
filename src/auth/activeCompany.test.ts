import { describe, expect, it } from "vitest"
import {
  activeCompanyReducer,
  initialActiveCompanyState,
  resolveActiveCompany,
  type CompanyMembership,
} from "./activeCompany"

const membership = (
  companyId: string,
  branchId: string | null = null,
  status = "active",
): CompanyMembership => ({
  companyId,
  companyName: `Company ${companyId}`,
  legalName: `Company ${companyId} LLC`,
  address: "",
  phone: "",
  email: "",
  taxRegistrationNumber: "",
  taxRate: 0,
  currency: "AED",
  country: "AE",
  invoicePrefix: "INV",
  invoiceFooter: "",
  logoPath: null,
  roleKey: "inventory_manager",
  roleName: "Inventory Manager",
  branchId,
  status,
})

describe("active company authorization state", () => {
  it("only resolves a company with an active membership", () => {
    expect(resolveActiveCompany([membership("company-a", null, "revoked")], "company-a"))
      .toBeNull()
    expect(resolveActiveCompany([membership("company-a")], "company-b"))
      .toBeNull()
  })

  it("retains every active company role and branch assignment", () => {
    const active = resolveActiveCompany([
      membership("company-a", null, "revoked"),
      membership("company-a", "branch-1"),
      membership("company-a", "branch-2"),
      membership("company-b"),
    ], "company-a")

    expect(active?.memberships.map((item) => item.branchId))
      .toEqual(["branch-1", "branch-2"])
  })

  it("clears previous company state and advances its revision during a switch", () => {
    const company = resolveActiveCompany([membership("company-a")], "company-a")
    if (!company) throw new Error("Expected active membership fixture.")

    const activeState = activeCompanyReducer(initialActiveCompanyState, {
      type: "activate",
      company,
    })
    const switchingState = activeCompanyReducer(activeState, { type: "begin" })

    expect(switchingState.activeCompany).toBeNull()
    expect(switchingState.loading).toBe(true)
    expect(switchingState.revision).toBe(activeState.revision + 1)
  })

  it("fails closed when the active membership is revoked or cannot be verified", () => {
    const company = resolveActiveCompany([membership("company-a")], "company-a")
    if (!company) throw new Error("Expected active membership fixture.")

    const activeState = activeCompanyReducer(initialActiveCompanyState, {
      type: "activate",
      company,
    })
    const revoked = activeCompanyReducer(activeState, {
      type: "deny",
      error: "Company membership is no longer active.",
    })

    expect(revoked.activeCompany).toBeNull()
    expect(revoked.loading).toBe(false)
    expect(revoked.error).toContain("no longer active")
  })
})

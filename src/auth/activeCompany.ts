export type CompanyMembership = {
  companyId: string
  companyName: string
  legalName: string
  address: string
  phone: string
  email: string
  taxRegistrationNumber: string
  taxRate: number
  currency: string
  country: string
  invoicePrefix: string
  invoiceFooter: string
  logoPath: string | null
  roleKey: string
  roleName: string
  branchId: string | null
  status: string
}

export type ActiveCompany = CompanyMembership & {
  memberships: CompanyMembership[]
}

export type ActiveCompanyState = {
  activeCompany: ActiveCompany | null
  loading: boolean
  error: string
  revision: number
}

export type ActiveCompanyAction =
  | { type: "begin" }
  | { type: "activate"; company: ActiveCompany }
  | { type: "deny"; error: string }
  | { type: "clear" }

export const initialActiveCompanyState: ActiveCompanyState = {
  activeCompany: null,
  loading: false,
  error: "",
  revision: 0,
}

export function resolveActiveCompany(
  memberships: CompanyMembership[],
  companyId: string,
): ActiveCompany | null {
  const activeMemberships = memberships.filter(
    (membership) =>
      membership.companyId === companyId &&
      membership.status === "active",
  )
  const first = activeMemberships[0]
  return first ? { ...first, memberships: activeMemberships } : null
}

export function activeCompanyReducer(
  state: ActiveCompanyState,
  action: ActiveCompanyAction,
): ActiveCompanyState {
  switch (action.type) {
    case "begin":
      return {
        activeCompany: null,
        loading: true,
        error: "",
        revision: state.revision + 1,
      }
    case "activate":
      return {
        ...state,
        activeCompany: action.company,
        loading: false,
        error: "",
      }
    case "deny":
      return {
        ...state,
        activeCompany: null,
        loading: false,
        error: action.error,
      }
    case "clear":
      return {
        activeCompany: null,
        loading: false,
        error: "",
        revision: state.revision + 1,
      }
  }
}

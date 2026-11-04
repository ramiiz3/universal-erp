import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import { useAuth } from "../auth/AuthProvider"
import { supabase } from "../lib/supabase"

export type CloudProduct = {
  id: string
  company_id: string
  name: string
  sku: string
  barcode: string
  description: string
  category: string
  manufacturer: string | null
  unit: string
  purchase_price: number
  selling_price: number
  minimum_stock: number
  vat_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CloudBranch = {
  id: string
  company_id: string
  name: string
}

export type CloudWarehouse = {
  id: string
  company_id: string
  branch_id: string
  name: string
  code: string
  address: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export type CloudInventoryLot = {
  id: string
  company_id: string
  product_id: string
  branch_id: string | null
  warehouse_id: string | null
  batch: string
  expiry: string | null
  quantity: number
  purchase_price: number
  selling_price: number | null
  total_purchase_value: number | null
  total_selling_value: number | null
  created_at: string
  updated_at: string
}

export type CloudMovement = {
  id: string
  company_id: string
  product_id: string
  lot_id: string | null
  branch_id: string | null
  warehouse_id: string | null
  movement_type: "OPENING" | "RECEIPT" | "SALE" | "RETURN" | "ADJUSTMENT" | "DAMAGE" | "LOSS"
  quantity: number
  reason: string
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
}

type CloudInventoryContextValue = {
  companyId: string
  products: CloudProduct[]
  branches: CloudBranch[]
  warehouses: CloudWarehouse[]
  lots: CloudInventoryLot[]
  movements: CloudMovement[]
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

const CloudInventoryContext = createContext<CloudInventoryContextValue | null>(null)

const EMPTY_DATA = {
  products: [] as CloudProduct[],
  branches: [] as CloudBranch[],
  warehouses: [] as CloudWarehouse[],
  lots: [] as CloudInventoryLot[],
  movements: [] as CloudMovement[],
}

export function CloudInventoryProvider({ children }: { children: ReactNode }) {
  const { activeCompany, activeCompanyRevision } = useAuth()
  const companyId = activeCompany?.companyId ?? ""
  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const requestVersion = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestVersion.current
    if (!supabase || !companyId) {
      setData(EMPTY_DATA)
      setError("Company inventory is unavailable until an active company is verified.")
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")
    const [products, branches, warehouses, lots, movements] = await Promise.all([
      supabase.from("products").select("*").eq("company_id", companyId).order("name"),
      supabase.from("branches").select("id, company_id, name").eq("company_id", companyId).order("name"),
      supabase.from("warehouses").select("*").eq("company_id", companyId).order("name"),
      supabase.from("inventory_lots").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("inventory_movements").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500),
    ])
    if (requestId !== requestVersion.current) return
    const errors = [products, branches, warehouses, lots, movements]
      .filter((result) => result.error)
      .map((result) => result.error?.message)
    setData({
      products: (products.data ?? []) as unknown as CloudProduct[],
      branches: (branches.data ?? []) as unknown as CloudBranch[],
      warehouses: (warehouses.data ?? []) as unknown as CloudWarehouse[],
      lots: (lots.data ?? []) as unknown as CloudInventoryLot[],
      movements: (movements.data ?? []) as unknown as CloudMovement[],
    })
    setError(errors.length ? `Some company inventory data could not be loaded: ${errors.join("; ")}` : "")
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    setData(EMPTY_DATA)
    setLoading(true)
    void refresh()
    return () => { requestVersion.current += 1 }
  }, [activeCompanyRevision, companyId, refresh])

  const value = useMemo(() => ({
    companyId,
    ...data,
    loading,
    error,
    refresh,
  }), [companyId, data, loading, error, refresh])

  return <CloudInventoryContext.Provider value={value}>{children}</CloudInventoryContext.Provider>
}

export function useCloudInventory() {
  const context = useContext(CloudInventoryContext)
  if (!context) throw new Error("useCloudInventory must be used inside CloudInventoryProvider.")
  return context
}

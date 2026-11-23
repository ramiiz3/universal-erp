import { dispatchERPCloudSync } from "./erpCloudState"

export type ProductCategory = {
  id: string
  name: string
  subcategories: string[]
  active: boolean
}

type ExistingProduct = {
  category?: string
  subcategory?: string
}

export const PRODUCT_CATEGORIES_STORAGE_KEY =
  "universal-erp-product-categories"

export const PRODUCT_CATEGORIES_EVENT =
  "universal-erp-product-categories-updated"

function createId() {
  return `category-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

export function getProductCategories(
  existingProducts: ExistingProduct[] = [],
): ProductCategory[] {
  if (typeof window === "undefined") return []

  let categories: ProductCategory[] = []

  try {
    const raw = localStorage.getItem(PRODUCT_CATEGORIES_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        categories = parsed
          .filter((item) => item && typeof item.name === "string")
          .map((item) => ({
            id: String(item.id || createId()),
            name: item.name.trim(),
            subcategories: Array.isArray(item.subcategories)
              ? item.subcategories.filter(
                  (value: unknown): value is string =>
                    typeof value === "string" && Boolean(value.trim()),
                )
              : [],
            active: item.active !== false,
          }))
          .filter((item) => item.name)
      }
    }
  } catch {
    categories = []
  }

  let changed = false

  for (const product of existingProducts) {
    const name = product.category?.trim()
    if (!name) continue

    let category = categories.find(
      (item) => normalize(item.name) === normalize(name),
    )

    if (!category) {
      category = {
        id: createId(),
        name,
        subcategories: [],
        active: true,
      }
      categories.push(category)
      changed = true
    }

    const subcategory = product.subcategory?.trim()
    if (
      subcategory &&
      !category.subcategories.some(
        (item) => normalize(item) === normalize(subcategory),
      )
    ) {
      category.subcategories.push(subcategory)
      changed = true
    }
  }

  if (categories.length === 0) {
    categories.push({
      id: createId(),
      name: "General",
      subcategories: [],
      active: true,
    })
    changed = true
  }

  if (changed) {
    localStorage.setItem(
      PRODUCT_CATEGORIES_STORAGE_KEY,
      JSON.stringify(categories),
    )
    dispatchERPCloudSync()
  }

  return categories
}

export function saveProductCategories(
  categories: ProductCategory[],
) {
  localStorage.setItem(
    PRODUCT_CATEGORIES_STORAGE_KEY,
    JSON.stringify(categories),
  )

  window.dispatchEvent(
    new Event(PRODUCT_CATEGORIES_EVENT),
  )
  dispatchERPCloudSync()
}

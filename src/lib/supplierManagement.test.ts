import { describe, expect, it } from "vitest"
import {
  linkPurchasesToSuppliers,
  normalizeSupplierRecords,
  validateSupplierInput,
  type Supplier,
} from "./supplierManagement"

const supplier: Supplier = {
  id: "SUP-1",
  name: "ABC Medical",
  contactPerson: "A Person",
  phone: "+971500000000",
  email: "orders@example.test",
  address: "Ajman",
  taxNumber: "TRN-1",
  status: "Active",
}

describe("central supplier master helpers", () => {
  it("normalizes legacy supplier records while retaining their IDs and details", () => {
    expect(normalizeSupplierRecords([supplier, { name: "Legacy Co" }])).toEqual([
      supplier,
      {
        id: "SUP-MIGRATED-2",
        name: "Legacy Co",
        contactPerson: "",
        phone: "",
        email: "",
        address: "",
        taxNumber: "",
        status: "Active",
      },
    ])
  })

  it("links historical purchases to supplier IDs by normalized supplier name", () => {
    const purchases = [
      { supplierName: " abc medical ", supplierInvoice: "INV-1" },
      { supplierName: "Unmatched Supplier", supplierInvoice: "INV-2" },
      { supplierName: "ABC Medical", supplierId: "SUP-OLD", supplierInvoice: "INV-3" },
    ]
    const linked = linkPurchasesToSuppliers(purchases, [supplier])

    expect(linked[0]?.supplierId).toBe("SUP-1")
    expect(linked[1]?.supplierId).toBeUndefined()
    expect(linked[2]?.supplierId).toBe("SUP-OLD")
    expect(linked.map((item) => item.supplierInvoice)).toEqual(["INV-1", "INV-2", "INV-3"])
  })

  it("trims valid supplier input", () => {
    expect(validateSupplierInput({
      name: "  New Medical  ",
      contactPerson: "  Person  ",
      phone: "  +971 50 123  ",
      email: "  orders@example.test  ",
      address: "  Ajman  ",
      taxNumber: "  TRN-2  ",
      status: "Active",
    }, [supplier])).toMatchObject({
      name: "New Medical",
      contactPerson: "Person",
      phone: "+971 50 123",
      email: "orders@example.test",
      address: "Ajman",
      taxNumber: "TRN-2",
    })
  })

  it("rejects missing names, missing phone numbers and duplicate names", () => {
    const input = {
      name: "ABC Medical",
      contactPerson: "",
      phone: "+971500000000",
      email: "",
      address: "",
      taxNumber: "",
      status: "Active" as const,
    }
    expect(() => validateSupplierInput({ ...input, name: " " }, [])).toThrow(/name is required/)
    expect(() => validateSupplierInput({ ...input, phone: " " }, [])).toThrow(/Phone number is required/)
    expect(() => validateSupplierInput(input, [supplier])).toThrow(/already exists/)
    expect(validateSupplierInput(input, [supplier], "SUP-1").name).toBe("ABC Medical")
  })
})

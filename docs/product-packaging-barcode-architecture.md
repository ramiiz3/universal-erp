# Product Catalog, Units, Packaging and Barcode Architecture

**Status:** Architecture proposal, based on the committed repository audit  
**Scope:** Universal ERP core + dedicated Pharmacy module  
**Initial market:** United Arab Emirates (UAE)  
**Production database changes:** None in this branch  
**Implementation strategy:** Additive, migration-led, tenant-safe, backward-compatible

## 1. Executive decisions

1. **Universal product core, vertical extensions.** Product, category, units, packaging, barcodes, prices and stock tracking belong to the universal ERP. Medicine-specific data belongs to a Pharmacy extension and must not be required for non-pharmacy businesses.
2. **One base stock unit per product.** Inventory balances and stock movements are stored in the product's base unit. A purchase, receipt, sale or POS line can be entered in another packaging level, but the transaction converts it to base units inside the database.
3. **Packaging conversion is product-specific.** A strip can contain 10 tablets for one product and 12 for another. Never assume that a generic "strip" or "box" has a universal conversion.
4. **Each barcode identifies a scannable trade unit.** A product may have several barcode records: one for its each/tablet, strip, box, carton, etc. Scanning a barcode resolves both product and packaging.
5. **Prices are packaging-specific.** The retail price for one box is not the same field/value as the retail price for one tablet. Transaction lines retain immutable price and conversion snapshots.
6. **Tenant isolation is mandatory.** New company-owned rows include `company_id`; compound foreign keys and RLS prevent cross-company references.
7. **Do not reset or rewrite production history.** New migrations must be additive. Existing product, lot, purchase, sale, invoice and movement records remain readable.

## 2. Repository audit (committed source)

This is an audit of the current committed `main` branch, not proof of which migrations have run on the live Supabase project.

### 2.1 Existing capabilities

| Area | Existing implementation |
|---|---|
| Company and branch foundation | `companies`, `branches`, memberships, roles, permissions and invitations |
| Product master | `public.products` with name, category text, SKU, one barcode, one unit, prices, minimum stock, VAT, manufacturer and active flag |
| Inventory | Warehouses, lots, batch/expiry, quantities, stock movements and FEFO lot allocation |
| Purchasing | Suppliers, purchase headers/lines, partial goods receipts and receipt-created inventory lots |
| Sales | Cloud sales, sale lines, payment records and atomic checkout |
| Security | RLS, company/branch permission checks, composite company foreign keys and database workflow functions |
| Legacy implementation | Separate localStorage-backed ERP routes and a separate authenticated Supabase workspace |

Primary source files:
- `supabase/migrations/20261103000100_company_auth_foundation.sql`
- `supabase/migrations/20261104000100_company_inventory_foundation.sql`
- `supabase/migrations/20261104000300_company_inventory_workflows.sql`
- `supabase/migrations/20261104000400_idempotent_inventory_operations.sql`
- `supabase/migrations/20261104130000_cloud_sales_purchasing.sql`
- `supabase/migrations/20261104140000_fix_cloud_transaction_integrity.sql`
- `src/inventory-cloud/domain.ts`
- `src/inventory-cloud/transactions.ts`
- `src/inventory-cloud/ProductsPage.tsx`
- `src/inventory-cloud/CloudPOSPage.tsx`
- `src/inventory-cloud/CloudPurchasingPage.tsx`
- `src/inventory-cloud/CloudInvoicePage.tsx`
- `src/inventory-cloud/CloudInventoryContext.tsx`
- `src/auth/WorkspaceRoutes.tsx`

### 2.2 Confirmed design gaps

- `products.category` is free text; it is not a managed category/subcategory relationship.
- `products.unit` is one text field; there is no units-of-measure catalogue or conversion model.
- Each product has one barcode field; there is no packaging-specific barcode registry.
- Each product has one default purchase price and selling price; no packaging-specific price list exists.
- Cloud POS and purchasing lines currently send a product ID and numeric quantity. They do not identify the packaging in which the quantity was entered.
- The stock ledger and lot balances currently use the product's single unit. This existing interpretation must be preserved during migration.
- Cloud invoice printing is a manual print action. The legacy invoice page has thermal receipt code, but it is not the authenticated cloud invoice workflow.
- Product-specific Pharmacy data is not separated into a Pharmacy module/extension.

### 2.3 Important application boundary

The repository contains two implementations:
- Legacy routes use `ERPContext` and browser storage.
- The authenticated company workspace under `/workspace/*` uses Supabase and company/branch RLS.

New production functionality should be built in the authenticated workspace. Useful legacy functionality may be ported after review, but localStorage must not become the source of truth for cloud company stock, invoices or payments.

## 3. Live database verification still required

The repository audit cannot confirm whether every committed migration has been applied to production, whether the live schema has manual changes, or whether real product units/categories contain values that need special migration handling.

Before creating the implementation migration:
1. Run the read-only audit in `docs/live-database-audit.sql` against the production Supabase project.
2. Compare the migration history with `supabase/migrations/README.md`.
3. Review aggregate counts and the distinct legacy category/unit values. Do not export customer, employee or other personal data for this product-schema audit.
4. Confirm the live `products`, `inventory_lots`, `inventory_movements`, `cloud_purchase_lines` and `cloud_sale_lines` columns, constraints, indexes and RLS policies.
5. Take/verify a production backup and rehearse the forward migration on a non-production database containing a recent sanitised schema/data copy.

The live audit has not been represented as completed in this document.

## 4. Target domain model

All company-owned tables below use `company_id` and tenant-safe composite relationships. Exact SQL types, grants, RLS and migration ordering will be finalised after the live audit.

### 4.1 Product categories

**`product_categories`**
- `id`, `company_id`
- `parent_id` (nullable; self-referential within the same company)
- `name`, `code`, `description`
- `is_active`, `sort_order`
- timestamps and `created_by`

Requirements:
- Arbitrary depth is technically possible; UI should initially support category and subcategory.
- A category cannot be its own parent or become a descendant of itself.
- Category names/codes are unique in the relevant parent scope within a company.
- Archive categories in use; do not cascade-delete product classification history.
- The old `products.category` text column remains during transition and is not dropped until data and clients are migrated.

### 4.2 Units of measure

**`units_of_measure`**
- `id`, `company_id`
- `code`, `name`, `symbol`
- `dimension` (count, mass, volume, length, area, time, service, custom)
- `allow_fraction`, `decimal_places`
- `is_active`, `is_system`
- timestamps

Examples include each, tablet, capsule, strip, box, carton, sachet, bottle, ml, litre, gram and kilogram. A unit label alone does not imply a conversion. Physical conversions such as kg-to-g or litre-to-ml must have explicit, dimensionally valid rules. Packaging conversions are stored per product in the packaging table.

Legacy unit strings must be preserved exactly during backfill. Unrecognised legacy values should be marked for review rather than silently guessed to be tablets, pieces or another dimension.

### 4.3 Products

Extend `public.products` additively with:
- `category_id` (nullable while legacy data is reconciled)
- `product_type` (stock, non_stock, service; future types require explicit review)
- `base_unit_id` (the unit in which on-hand inventory is stored)
- optional brand/manufacturer references as structured entities in a later catalogue milestone
- `track_batch`, `track_expiry`, `allow_negative_stock` policy flags only where the business explicitly enables them

Keep the existing `category` and `unit` text columns during compatibility transition. Do not make `base_unit_id` mandatory until every existing product is backfilled and reviewed.

### 4.4 Product packaging

**`product_packagings`**
- `id`, `company_id`, `product_id`
- `unit_id` (the displayed/scanned unit, such as strip, box or sachet)
- `name` (optional product-facing label, e.g. "Pack of 10")
- `base_quantity` (number of base units contained in one packaging unit)
- `is_base`, `is_purchase_unit`, `is_sales_unit`
- `allow_fractional_quantity`, `is_active`, `sort_order`
- timestamps

Rules:
- Exactly one active base packaging per product; its `base_quantity = 1`.
- Every other packaging has `base_quantity > 1`, expressed directly in base units.
- Use direct-to-base factors, not chained factors. Example: a strip = 10 tablets and a box = 100 tablets. This avoids conversion-chain drift and circular relationships.
- Packaging factors are product-specific and should be locked from casual edits once referenced by posted transactions. Changes create a new active packaging version/record or an explicit effective-dated revision. Posted lines retain their original snapshot.
- Decimal conversions are allowed only when the base unit and packaging configuration permit them.
- A product packaging cannot point to a unit belonging to another company.

Example:

| Product | Packaging | Base quantity |
|---|---|---:|
| Example medicine | Tablet (base) | 1 |
| Example medicine | Strip | 10 |
| Example medicine | Box | 100 |
| Example powder | Sachet (base) | 1 |
| Example powder | Carton | 20 |

The example values are illustrative only. The operator must enter the manufacturer's real pack composition.

### 4.5 Product barcodes

**`product_barcodes`**
- `id`, `company_id`, `product_id`, `packaging_id`
- `barcode_value` (stored as text to preserve leading zeros)
- `symbology` (EAN-13, EAN-8, UPC-A, Code 128, QR, Data Matrix, GS1-128, other)
- `barcode_kind` (manufacturer_gtin, internal, supplier, other)
- `is_primary`, `is_active`
- optional source/reference and timestamps

Rules:
- A normalized barcode value is unique within a company.
- A scan resolves a product **and** its packaging level.
- Do not silently replace manufacturer barcodes.
- Do not generate or claim a GS1 GTIN for the company. Manufacturer/GS1 GTINs are recorded when supplied by an authorised source.
- Internally generated codes must be clearly marked `internal`; Code 128 is a suitable internal label format. Use a database-side atomic uniqueness guarantee and a unique index; do not rely on a browser-only random check.
- Existing `products.barcode` values should be copied to the base packaging (or flagged for manual packaging mapping if the existing product unit is not truly the each/base unit) and retained until all old clients are migrated.
- The project already includes `jsbarcode` and ZXing packages; these can support label rendering and scan decoding once the data model is in place.

### 4.6 Packaging-specific price list

**`product_prices`**
- `id`, `company_id`, `product_id`, `packaging_id`
- `price_type` (purchase, retail, wholesale, minimum_selling, other)
- `currency_code` (AED for the initial company profile; table supports other ISO currencies)
- `amount`, `tax_inclusive`
- optional `branch_id`, `customer_group_id`, `supplier_id`
- `valid_from`, `valid_to`, `is_active`
- timestamps

Requirements:
- Price is for one selected packaging unit.
- Price selection precedence (branch/customer group/default) must be explicit and testable.
- Transaction prices and tax treatment are snapshotted; later price edits never change posted invoices or purchase history.
- Avoid silently deriving a box price by multiplying the tablet price when a distinct retail price is configured.

### 4.7 Pharmacy extension

**`pharmacy_product_details`** (optional one-to-one extension):
- `company_id`, `product_id`
- generic/active ingredient name
- strength and strength unit
- dosage form and route of administration
- prescription-required indicator
- controlled-medicine classification/reference (only when applicable)
- storage and handling notes
- UAE registration/authorisation reference fields and source/verification status where the operator maintains them

This table must not be required for non-pharmacy product types. Controlled-medicine rules, medicine registration and dispensing requirements require separate UAE regulatory review before being encoded as hard business rules.

## 5. Transaction and stock semantics

### 5.1 Single source of truth for quantity

- `inventory_lots.quantity` and `inventory_movements.quantity` remain expressed in the product's base unit.
- Purchasing/receiving and POS/sales accept `packaging_id` + `entered_quantity`.
- The database loads the packaging factor, calculates `base_quantity = entered_quantity * base_quantity_factor`, validates precision and updates the lot ledger atomically.
- Browser estimates are previews only. The database function is authoritative and recalculates conversion, price, tax, stock and totals under row locks.
- FEFO allocation runs on base-unit quantities and eligible lots.

### 5.2 Immutable transaction snapshots

Add fields to purchase/sale lines rather than reinterpreting old columns:
- `packaging_id` (nullable for historical/legacy rows)
- `entered_quantity`
- `packaging_name_snapshot`
- `packaging_unit_code_snapshot`
- `conversion_factor_snapshot`
- `base_unit_name_snapshot`
- `base_quantity`
- `entered_unit_price` or `entered_unit_cost` (price per selected pack)
- retain the existing per-base-unit quantity/cost/price semantics for compatibility during transition

Posted lines must remain readable if a product's packaging, category, barcode or display name is later edited or archived.

### 5.3 Purchase/receipt flow

1. Select supplier and product.
2. Select purchase packaging (e.g. box) and enter pack count.
3. Show conversion and resulting base quantity before saving.
4. Record supplier price per selected pack and derive the base cost consistently.
5. On goods receipt, capture actual received packaging quantity, batch, expiry, accepted/rejected quantities and actual price adjustments.
6. Convert to base units and create lot + movement entries inside the receipt transaction.
7. Support partial receipts without losing the original order quantity or unit snapshot.

### 5.4 POS/sale flow

1. Scan barcode or search product.
2. Barcode lookup returns product + matched packaging.
3. Cashier can change packaging where permitted.
4. Display pack quantity, base-unit conversion, price and available stock.
5. On checkout, convert to base units and allocate across eligible lots by FEFO.
6. Store selected pack, entered quantity, conversion and price snapshots on invoice line.
7. Return/refund logic must reverse the correct base quantity and preserve lot traceability.

### 5.5 Example conversion

If a product's configured packaging is:
- 1 tablet = 1 base unit
- 1 strip = 10 base units
- 1 box = 100 base units

Then a receipt of 5 boxes increases stock by 500 tablets. A sale of 2 strips and 3 tablets decreases stock by 23 tablets. Inventory never stores "5 boxes" as a second independent stock balance.

## 6. UAE initial-market profile

The universal data model should remain multi-market capable. UAE is the initial company setup profile, not a hard-coded limit on the ERP.

Initial configuration requirements:
- AED company currency and correct currency precision/formatting.
- Company tax registration/TRN fields (the repository already has company-level tax registration number and tax rate fields).
- Tax-inclusive/exclusive product-price handling, line-level tax snapshots and compliant invoice output after UAE tax review.
- Branch-level invoice identity, address and printer settings.
- Arabic/English product and invoice labels may be introduced through localised display fields without changing product identity.
- Country, currency and tax configuration must be company-controlled. Do not bake UAE-only assumptions into universal product, packaging or stock tables.

This architecture is not a tax/legal compliance certification. VAT, invoice wording, medicine registration and controlled-product workflows require validation against current UAE requirements before release.

## 7. Migration and compatibility plan

No destructive migration should be written until the live audit is reviewed.

Recommended additive migration sequence:

1. Create `product_categories`, `units_of_measure`, `product_packagings`, `product_barcodes`, `product_prices` and the optional Pharmacy extension with composite company constraints.
2. Add nullable `category_id` and `base_unit_id` to `products`.
3. Backfill distinct legacy category strings into per-company categories; map products to those categories. Preserve original text.
4. Backfill legacy `unit` values into company unit records. Preserve original labels. Flag unclassified/ambiguous values for review; do not guess physical dimensions.
5. Create a base packaging (factor 1) for each product only after confirming the current `products.unit` is the unit represented by its existing inventory balances.
6. Copy existing product barcode values to the base packaging only when the mapping is correct; otherwise create a review queue.
7. Add nullable transaction snapshot fields to purchase/sale lines. Historical lines remain unchanged and are identified by null packaging snapshots.
8. Update database RPCs and frontend together so all new transactions require packaging selection (defaulting to base packaging when appropriate).
9. Run backfill reconciliation queries: product count, lot balance sums, movement totals, purchase/sale totals, uniqueness and orphan checks.
10. Only after all application paths are migrated and historical compatibility is proven may legacy text columns be deprecated in a separate future release.

Never update the quantity of existing lots or movements merely to make a packaging example fit. Existing quantities already mean the old product unit; preserve them.

## 8. RLS, constraints and integrity controls

- Enable RLS on every new tenant-owned table.
- Use company-scoped SELECT policies and explicit catalogue-management permissions for writes (initially mapped to existing inventory-management permission until role capabilities are split).
- Add compound foreign keys such as `(company_id, product_id)` and `(company_id, packaging_id)`.
- Add unique indexes for category code/name scope, UOM code, one base packaging per product, active barcode values and applicable price uniqueness.
- Validate positive conversion factors, exactly one base packaging, valid price/quantity precision and date ranges.
- Prevent category self-parenting/cycles.
- Prevent deletion/alteration of packaging records referenced by posted transactions; archive or version them.
- Keep stock mutation in security-definer RPCs with fixed search paths, explicit permission checks, row locks and request-id idempotency.
- Do not expose service-role keys in frontend code.
- Write tests for cross-company references, cross-branch permissions, duplicate barcodes, invalid conversion factors, quantity rounding, concurrent checkout and idempotent retries.

## 9. Required implementation test cases

1. Create product with tablet as base, strip factor 10 and box factor 100.
2. Assign three distinct internal/manufacturer barcode records and resolve each scan to the correct package.
3. Purchase 5 boxes; verify +500 base units and one correct receipt movement.
4. Partially receive 3 boxes; later receive 2 boxes; ensure order status and balances are correct.
5. Sell 2 strips + 3 tablets; verify -23 base units, price/tax and invoice snapshots.
6. Sell one box when stock exists across multiple eligible lots; verify FEFO allocation and one correct commercial line with multiple lot allocations if the design supports it.
7. Attempt to sell expired stock; reject it under existing FEFO rules.
8. Retry the same purchase receipt/checkout request; verify no double stock movement.
9. Archive a packaging level after it has been used; verify historical invoices still render.
10. Attempt cross-company product/category/unit/packaging/barcode references; database must reject them.
11. Verify legacy product, lot, invoice and purchase records render exactly as before.
12. Verify UAE company settings (AED, TRN and tax configuration) do not leak into another company's settings.

## 10. Implementation gates

**Gate A — Live database audit:** migration history, actual columns/constraints/indexes/RLS/function signatures and aggregate counts verified.

**Gate B — Migration rehearsal:** additive SQL applied to a non-production copy; backfills and reconciliation pass.

**Gate C — Backend:** RLS, constraints, barcode allocation and atomic conversion RPCs covered by SQL tests.

**Gate D — Application:** product/category/packaging/barcode UI, purchase receipt, POS and invoice snapshots connected to the same model.

**Gate E — Release:** backup verified, migrations applied in order, deployment smoke tests and rollback/forward-fix procedure documented.

No implementation migration is approved by this design document.
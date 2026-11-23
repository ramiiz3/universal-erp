import { Navigate, Route, Routes } from "react-router-dom"
import AppLayout from "./layouts/AppLayout"

import Dashboard from "./pages/Dashboard"
import POS from "./pages/POS"
import DailyRegister from "./pages/DailyRegister"
import Sales from "./pages/Sales"
import Invoices from "./pages/Invoices"
import CustomerPayments from "./pages/CustomerPayments"
import PaymentReconciliation from "./pages/PaymentReconciliation"
import SalesReturns from "./pages/SalesReturns"
import Customers from "./pages/Customers"
import Products from "./pages/Products"
import Categories from "./pages/Categories"
import Units from "./pages/Units"
import StockLedger from "./pages/StockLedger"
import StockTransfers from "./pages/StockTransfers"
import WarehouseManagement from "./pages/WarehouseManagement"
import Inventory from "./pages/Inventory"
import InventoryAlerts from "./pages/InventoryAlerts"
import StockCounts from "./pages/StockCounts"
import StockValuation from "./pages/StockValuation"
import Purchasing from "./pages/Purchasing"
import ProcurementWorkflow from "./pages/ProcurementWorkflow"
import SupplierInvoices from "./pages/SupplierInvoices"
import Suppliers from "./pages/Suppliers"
import Reports from "./pages/Reports"
import ChartOfAccounts from "./pages/ChartOfAccounts"
import Settings from "./pages/Settings"
import AI from "./pages/AI"

import { ERPProvider } from "./context/ERPContext"
import { ThemeProvider } from "./context/ThemeContext"
import { AuthProvider } from "./auth/AuthProvider"
import {
  InvitationPage,
  LoginPage,
  RecoveryPage,
  RegistrationPage,
} from "./auth/AuthPages"
import WorkspaceRoutes from "./auth/WorkspaceRoutes"

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegistrationPage />} />
          <Route path="/auth/recover" element={<RecoveryPage />} />
          <Route path="/auth/invite/:token" element={<InvitationPage />} />
          <Route path="/workspace/*" element={<WorkspaceRoutes />} />
          <Route element={<ERPProvider><AppLayout /></ERPProvider>}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/daily-register" element={<DailyRegister />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/customer-payments" element={<CustomerPayments />} />
            <Route path="/payment-reconciliation" element={<PaymentReconciliation />} />
            <Route path="/sales-returns" element={<SalesReturns />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/:invoiceId" element={<Invoices />} />
            <Route path="/customers" element={<Customers />} />
  <Route path="/products" element={<Products />} />
  <Route path="/categories" element={<Categories />} />
  <Route path="/units" element={<Units />} />
  <Route path="/stock-ledger" element={<StockLedger />} />
            <Route path="/stock-transfers" element={<StockTransfers />} />
            <Route path="/warehouses" element={<WarehouseManagement />} />
            <Route path="/warehouse" element={<WarehouseManagement />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory-alerts" element={<InventoryAlerts />} />
            <Route path="/stock-counts" element={<StockCounts />} />
            <Route path="/stock-valuation" element={<StockValuation />} />
            <Route path="/purchasing" element={<Purchasing />} />
            <Route path="/procurement-workflow" element={<ProcurementWorkflow />} />
            <Route path="/supplier-invoices" element={<SupplierInvoices />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/ai" element={<AI />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

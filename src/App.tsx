import { Navigate, Route, Routes } from "react-router-dom"
import AppLayout from "./layouts/AppLayout"

import Dashboard from "./pages/Dashboard"
import POS from "./pages/POS"
import Sales from "./pages/Sales"
import Invoices from "./pages/Invoices"
import Customers from "./pages/Customers"
import Products from "./pages/Products"
import Inventory from "./pages/Inventory"
import Purchasing from "./pages/Purchasing"
import Suppliers from "./pages/Suppliers"
import Reports from "./pages/Reports"
import Settings from "./pages/Settings"
import AI from "./pages/AI"

import { ERPProvider } from "./context/ERPContext"

export default function App() {
  return (
    <ERPProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/"
            element={
              <Navigate
                to="/dashboard"
                replace
              />
            }
          />

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/pos"
            element={<POS />}
          />

          <Route
            path="/sales"
            element={<Sales />}
          />

          <Route
            path="/invoices"
            element={<Invoices />}
          />

          <Route
            path="/invoices/:invoiceId"
            element={<Invoices />}
          />

          <Route
            path="/customers"
            element={<Customers />}
          />

          <Route
            path="/products"
            element={<Products />}
          />

          <Route
            path="/inventory"
            element={<Inventory />}
          />

          <Route
            path="/purchasing"
            element={<Purchasing />}
          />

          <Route
            path="/suppliers"
            element={<Suppliers />}
          />

          <Route
            path="/reports"
            element={<Reports />}
          />

          <Route
            path="/ai"
            element={<AI />}
          />

          <Route
            path="/settings"
            element={<Settings />}
          />
        </Route>
      </Routes>
    </ERPProvider>
  )
}

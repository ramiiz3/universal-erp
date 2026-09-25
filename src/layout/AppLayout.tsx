import {
  Bell,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Moon,
  Package,
  ScanBarcode,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Users,
  Warehouse,
} from "lucide-react"
import { useState } from "react"
import { NavLink, Outlet } from "react-router-dom"

const navigation = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "POS", path: "/pos", icon: ScanBarcode },
  { label: "Sales", path: "/sales", icon: ShoppingCart },
  { label: "Invoices", path: "/invoices", icon: FileText },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Products", path: "/products", icon: Package },
  { label: "Inventory", path: "/inventory", icon: Warehouse },
  { label: "Purchasing", path: "/purchasing", icon: Boxes },
  { label: "Reports", path: "/reports", icon: CircleDollarSign },
]

export default function AppLayout() {
  const [darkMode, setDarkMode] = useState(false)

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 border-r bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex lg:flex-col">
            <div className="flex h-20 items-center border-b px-6 dark:border-slate-800">
              <div>
                <div className="text-lg font-bold tracking-tight">
                  Universal<span className="text-emerald-600">ERP</span>
                </div>
                <div className="text-xs text-slate-500">
                  Zaki Pharmacy
                </div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 p-4">
              {navigation.map((item) => {
                const Icon = item.icon

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      }`
                    }
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}

              <div className="my-4 border-t dark:border-slate-800" />

              <NavLink
                to="/ai"
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`
                }
              >
                <Sparkles size={18} />
                AI Assistant
              </NavLink>

              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`
                }
              >
                <Settings size={18} />
                Settings
              </NavLink>
            </nav>

            <div className="border-t p-4 dark:border-slate-800">
              <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Sparkles size={16} />
                  AI Assistant
                </div>
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">
                  Ask about sales, inventory, products and business insights.
                </p>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b bg-white/90 px-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:px-8">
              <div className="flex items-center gap-3">
                <img
                  src="/brand/zaki-logo.png"
                  alt="Zaki Pharmacy"
                  className="h-10 w-auto max-w-[210px] object-contain"
                />

                <div className="hidden border-l border-slate-200 pl-3 sm:block">
                  <h1 className="text-sm font-semibold text-slate-900">
                    UniversalERP
                  </h1>
                  <p className="text-xs text-slate-500">
                    Pharmacy Management System
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Bell size={19} />
                </button>

                <button className="hidden rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 sm:flex sm:items-center sm:gap-2">
                  <Sparkles size={16} />
                  Ask AI
                </button>

                <button
                  onClick={() => setDarkMode((value) => !value)}
                  className="rounded-xl border p-2.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                <button className="flex items-center gap-2 rounded-xl border px-2.5 py-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    AK
                  </div>

                  <div className="hidden text-left md:block">
                    <div className="text-sm font-medium">Admin</div>
                    <div className="text-xs text-slate-500">Owner</div>
                  </div>

                  <ChevronDown size={15} />
                </button>
              </div>
            </header>

            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
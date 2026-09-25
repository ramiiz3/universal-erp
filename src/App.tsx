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

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "POS", icon: ScanBarcode },
  { label: "Sales", icon: ShoppingCart },
  { label: "Invoices", icon: FileText },
  { label: "Customers", icon: Users },
  { label: "Products", icon: Package },
  { label: "Inventory", icon: Warehouse },
  { label: "Purchasing", icon: Boxes },
  { label: "Reports", icon: CircleDollarSign },
]

const stats = [
  {
    title: "Today's Sales",
    value: "AED 4,850",
    change: "+12.5%",
  },
  {
    title: "Today's Orders",
    value: "73",
    change: "+8.2%",
  },
  {
    title: "Products in Stock",
    value: "4,280",
    change: "+3.4%",
  },
  {
    title: "Estimated Profit",
    value: "AED 1,240",
    change: "+10.8%",
  },
]

const topProducts = [
  { name: "Panadol Extra", sold: 284, stock: 125 },
  { name: "Vitamin C 1000mg", sold: 192, stock: 84 },
  { name: "Cetaphil Cleanser", sold: 147, stock: 67 },
  { name: "Nivea Moisturiser", sold: 121, stock: 41 },
]

export default function App() {
  const [darkMode, setDarkMode] = useState(false)

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden w-64 shrink-0 border-r bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex lg:flex-col">
            <div className="flex h-20 items-center border-b px-6 dark:border-slate-800">
              <div>
                <div className="text-lg font-bold tracking-tight">
                  Universal<span className="text-emerald-600">ERP</span>
                </div>
                <div className="text-xs text-slate-500">
                  Al Khalis & Zaki
                </div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 p-4">
              {navigation.map((item, index) => {
                const Icon = item.icon
                const active = index === 0

                return (
                  <button
                    key={item.label}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              })}

              <div className="my-4 border-t dark:border-slate-800" />

              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                <Sparkles size={18} />
                AI Assistant
              </button>

              <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                <Settings size={18} />
                Settings
              </button>
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

          {/* Main */}
          <main className="min-w-0 flex-1">
            {/* Topbar */}
            <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b bg-white/90 px-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:px-8">
              <div>
                <h1 className="text-xl font-semibold">Dashboard</h1>
                <p className="text-sm text-slate-500">
                  Welcome back. Here's what's happening today.
                </p>
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
                  onClick={() => setDarkMode(!darkMode)}
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

            {/* Dashboard */}
            <section className="space-y-6 p-5 md:p-8">
              {/* Stats */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <div
                    key={stat.title}
                    className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="text-sm text-slate-500">
                      {stat.title}
                    </div>

                    <div className="mt-2 text-2xl font-bold tracking-tight">
                      {stat.value}
                    </div>

                    <div className="mt-2 text-xs font-medium text-emerald-600">
                      {stat.change} vs previous period
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">Sales Overview</h2>
                      <p className="text-sm text-slate-500">
                        Revenue performance this week
                      </p>
                    </div>

                    <button className="rounded-lg border px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      This Week
                    </button>
                  </div>

                  <div className="flex h-64 items-end gap-3">
                    {[42, 58, 48, 72, 66, 88, 76, 94, 82, 96, 78, 89].map(
                      (height, index) => (
                        <div
                          key={index}
                          className="flex flex-1 flex-col justify-end"
                        >
                          <div
                            className="rounded-t-lg bg-emerald-500/80 transition hover:bg-emerald-600"
                            style={{ height: `${height}%` }}
                          />
                        </div>
                      ),
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-4 text-xs text-slate-400">
                    <span>Mon</span>
                    <span className="text-center">Wed</span>
                    <span className="text-center">Fri</span>
                    <span className="text-right">Sun</span>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-5">
                    <h2 className="font-semibold">Top Products</h2>
                    <p className="text-sm text-slate-500">
                      Best-selling products
                    </p>
                  </div>

                  <div className="space-y-4">
                    {topProducts.map((product) => (
                      <div key={product.name}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {product.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {product.sold} units sold
                            </div>
                          </div>

                          <span className="text-xs font-medium text-slate-500">
                            {product.stock} stock
                          </span>
                        </div>

                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.min(product.sold / 3, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Alerts */}
              <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-sm font-semibold">Low Stock</div>
                  <div className="mt-2 text-3xl font-bold">27</div>
                  <p className="mt-1 text-sm text-slate-500">
                    Products need attention
                  </p>
                </div>

                <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-sm font-semibold">Expiring Soon</div>
                  <div className="mt-2 text-3xl font-bold">14</div>
                  <p className="mt-1 text-sm text-slate-500">
                    Within the next 90 days
                  </p>
                </div>

                <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-sm font-semibold">Pending Payments</div>
                  <div className="mt-2 text-3xl font-bold">AED 8,420</div>
                  <p className="mt-1 text-sm text-slate-500">
                    Across outstanding invoices
                  </p>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
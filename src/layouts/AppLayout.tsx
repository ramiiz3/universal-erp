import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Moon,
  Package,
  ScanBarcode,
  Settings as SettingsIcon,
  ShoppingCart,
  Sparkles,
  Sun,
  UserRound,
  Users,
  Warehouse,
  X,
  LayoutDashboard,
  Bot,
  CheckCircle2,
  Clock3,
} from "lucide-react"
import { useERP } from "../context/ERPContext"

const menuItems = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "POS",
    path: "/pos",
    icon: ScanBarcode,
  },
  {
    label: "Sales",
    path: "/sales",
    icon: ShoppingCart,
  },
  {
    label: "Invoices",
    path: "/invoices",
    icon: FileText,
  },
  {
    label: "Customers",
    path: "/customers",
    icon: Users,
  },
  {
    label: "Products",
    path: "/products",
    icon: Package,
  },
  {
    label: "Inventory",
    path: "/inventory",
    icon: Warehouse,
  },
  {
    label: "Purchasing",
    path: "/purchasing",
    icon: Boxes,
  },
  {
    label: "Suppliers",
    path: "/suppliers",
    icon: Building2,
  },
  {
    label: "Reports",
    path: "/reports",
    icon: CircleDollarSign,
  },
  {
    label: "AI Assistant",
    path: "/ai",
    icon: Bot,
  },
  {
    label: "Settings",
    path: "/settings",
    icon: SettingsIcon,
  },
]

type OwnerProfile = {
  name: string
  email: string
  phone: string
  role: string
}

type AppNotification = {
  id: string
  title: string
  message: string
  path: string
  tone: "red" | "amber" | "blue"
}

const THEME_KEY = "universal-erp-theme"
const OWNER_KEY = "universal-erp-owner-profile"
const READ_NOTIFICATIONS_KEY =
  "universal-erp-read-notifications"

const defaultOwner: OwnerProfile = {
  name: "Admin Owner",
  email: "",
  phone: "",
  role: "Owner",
}

function loadOwner(): OwnerProfile {
  try {
    const raw =
      localStorage.getItem(OWNER_KEY)

    if (!raw) return defaultOwner

    const parsed = JSON.parse(raw)

    return {
      ...defaultOwner,
      ...parsed,
    }
  } catch {
    return defaultOwner
  }
}

function loadReadNotifications(): string[] {
  try {
    const raw = localStorage.getItem(
      READ_NOTIFICATIONS_KEY,
    )

    if (!raw) return []

    const parsed = JSON.parse(raw)

    return Array.isArray(parsed)
      ? parsed
      : []
  } catch {
    return []
  }
}

function getInitialDarkMode() {
  const stored =
    localStorage.getItem(THEME_KEY)

  if (stored === "dark") return true
  if (stored === "light") return false

  return window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches
}

export default function AppLayout() {
  const navigate = useNavigate()

  const {
    products,
    inventoryLots,
    sales,
  } = useERP()

  const [darkMode, setDarkMode] =
    useState(getInitialDarkMode)

  const [notificationsOpen, setNotificationsOpen] =
    useState(false)

  const [ownerOpen, setOwnerOpen] =
    useState(false)

  const [profileOpen, setProfileOpen] =
    useState(false)

  const [owner, setOwner] =
    useState<OwnerProfile>(loadOwner)

  const [profileForm, setProfileForm] =
    useState<OwnerProfile>(loadOwner)

  const [readNotifications, setReadNotifications] =
    useState<string[]>(
      loadReadNotifications,
    )

  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      darkMode,
    )

    localStorage.setItem(
      THEME_KEY,
      darkMode ? "dark" : "light",
    )
  }, [darkMode])

  const notifications = useMemo<
    AppNotification[]
  >(() => {
    const result: AppNotification[] = []

    products.forEach((product) => {
      const stock = inventoryLots
        .filter(
          (lot) =>
            lot.productId === product.id,
        )
        .reduce(
          (sum, lot) =>
            sum + lot.quantity,
          0,
        )

      if (stock <= product.minimumStock) {
        result.push({
          id: `low-stock-${product.id}`,
          title: "Low Stock",
          message: `${product.name} has ${stock} ${product.unit.toLowerCase()} available.`,
          path: "/inventory",
          tone: "red",
        })
      }
    })

    const today = new Date()
    const cutoff = new Date()
    cutoff.setDate(
      cutoff.getDate() + 90,
    )

    inventoryLots.forEach((lot) => {
      if (lot.quantity <= 0) return

      const expiry = new Date(
        `${lot.expiry}T00:00:00`,
      )

      if (
        expiry >= today &&
        expiry <= cutoff
      ) {
        const product = products.find(
          (item) =>
            item.id ===
            lot.productId,
        )

        result.push({
          id: `expiry-${lot.id}`,
          title: "Expiry Alert",
          message: `${product?.name ?? "Product"} batch ${lot.batch} expires on ${lot.expiry}.`,
          path: "/inventory",
          tone: "amber",
        })
      }
    })

    sales
      .filter(
        (sale) =>
          sale.status === "Pending",
      )
      .slice(0, 8)
      .forEach((sale) => {
        result.push({
          id: `credit-${sale.id}`,
          title: "Pending Credit",
          message: `${sale.invoiceNumber} has AED ${sale.total.toFixed(2)} outstanding.`,
          path: "/sales",
          tone: "blue",
        })
      })

    return result.slice(0, 25)
  }, [products, inventoryLots, sales])

  const unreadCount = notifications.filter(
    (item) =>
      !readNotifications.includes(item.id),
  ).length

  const initials = owner.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  function markNotificationRead(
    notification: AppNotification,
  ) {
    const next = Array.from(
      new Set([
        ...readNotifications,
        notification.id,
      ]),
    )

    setReadNotifications(next)

    localStorage.setItem(
      READ_NOTIFICATIONS_KEY,
      JSON.stringify(next),
    )

    setNotificationsOpen(false)
    navigate(notification.path)
  }

  function markAllRead() {
    const allIds =
      notifications.map(
        (item) => item.id,
      )

    setReadNotifications(allIds)

    localStorage.setItem(
      READ_NOTIFICATIONS_KEY,
      JSON.stringify(allIds),
    )
  }

  function openProfile() {
    setProfileForm(owner)
    setOwnerOpen(false)
    setProfileOpen(true)
  }

  function saveProfile(
    event: FormEvent,
  ) {
    event.preventDefault()

    const nextOwner = {
      ...profileForm,
      name:
        profileForm.name.trim() ||
        "Admin Owner",
      role:
        profileForm.role.trim() ||
        "Owner",
    }

    setOwner(nextOwner)

    localStorage.setItem(
      OWNER_KEY,
      JSON.stringify(nextOwner),
    )

    setProfileOpen(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-[#0b120e] dark:text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-[#101813] lg:flex lg:flex-col">
          <div className="flex h-20 items-center border-b border-slate-200 px-5 dark:border-slate-800">
            <img
              src={darkMode ? "/brand/zaki-logo-white.png" : "/brand/zaki-logo.png"}
              alt="Zaki Pharmacy"
              className="max-h-12 w-auto max-w-[190px] object-contain"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <nav className="space-y-1">
              {menuItems.map(
                ({
                  label,
                  path,
                  icon: Icon,
                }) => (
                  <NavLink
                    key={path}
                    to={path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      }`
                    }
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {label}
                  </NavLink>
                ),
              )}
            </nav>
          </div>

          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <Sparkles size={16} />
                UniversalERP
              </div>

              <p className="text-xs leading-5 text-emerald-700/80 dark:text-emerald-300/70">
                Zaki Pharmacy management system
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6 dark:border-slate-800 dark:bg-[#101813]/95">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={darkMode ? "/brand/zaki-logo-white.png" : "/brand/zaki-logo.png"}
                alt="Zaki Pharmacy"
                className="max-h-10 w-auto max-w-[180px] object-contain lg:hidden"
              />

              <div className="hidden border-l border-slate-200 pl-4 dark:border-slate-700 lg:block">
                <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  UniversalERP
                </h1>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pharmacy Management System
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setNotificationsOpen(
                      (value) => !value,
                    )
                  }
                  className="relative rounded-xl border border-transparent p-2.5 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Notifications"
                >
                  <Bell size={19} />

                  {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {unreadCount > 9
                        ? "9+"
                        : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a15]">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          Notifications
                        </p>

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {unreadCount} unread
                        </p>
                      </div>

                      {notifications.length > 0 && (
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-[420px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />

                          <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">
                            All clear
                          </p>

                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            There are no active ERP alerts.
                          </p>
                        </div>
                      ) : (
                        notifications.map(
                          (notification) => {
                            const unread =
                              !readNotifications.includes(
                                notification.id,
                              )

                            const Icon =
                              notification.tone ===
                              "red"
                                ? AlertTriangle
                                : notification.tone ===
                                    "amber"
                                  ? Clock3
                                  : FileText

                            return (
                              <button
                                key={
                                  notification.id
                                }
                                type="button"
                                onClick={() =>
                                  markNotificationRead(
                                    notification,
                                  )
                                }
                                className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                                  unread
                                    ? "bg-slate-50/80 dark:bg-slate-800/40"
                                    : ""
                                }`}
                              >
                                <div
                                  className={`mt-0.5 rounded-lg p-2 ${
                                    notification.tone ===
                                    "red"
                                      ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                                      : notification.tone ===
                                          "amber"
                                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                                        : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                                  }`}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {notification.title}
                                  </p>

                                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                    {
                                      notification.message
                                    }
                                  </p>
                                </div>

                                {unread && (
                                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                                )}
                              </button>
                            )
                          },
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setDarkMode(
                    (value) => !value,
                  )
                }
                className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label={
                  darkMode
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
              >
                {darkMode ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate("/ai")
                }
                className="hidden items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 sm:flex"
              >
                <Sparkles size={16} />
                Ask AI
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOwnerOpen(
                      (value) => !value,
                    )
                  }
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-2 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                    {initials || "AO"}
                  </span>

                  <span className="hidden text-left sm:block">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                      {owner.name}
                    </span>

                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {owner.role}
                    </span>
                  </span>

                  <ChevronDown
                    size={15}
                    className="text-slate-400"
                  />
                </button>

                {ownerOpen && (
                  <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a15]">
                    <div className="border-b border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 font-bold text-white">
                          {initials || "AO"}
                        </span>

                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {owner.name}
                          </p>

                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {owner.role}
                          </p>

                          {owner.email && (
                            <p className="mt-1 truncate text-[11px] text-slate-400">
                              {owner.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-2">
                      <button
                        type="button"
                        onClick={openProfile}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <UserRound className="h-4 w-4" />
                        My Profile
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOwnerOpen(false)
                          navigate("/settings")
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <SettingsIcon className="h-4 w-4" />
                        Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      {profileOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#111a15]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  Admin Profile
                </h2>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Manage the owner profile for this ERP.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setProfileOpen(false)
                }
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveProfile}>
              <div className="space-y-4 p-5">
                <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 font-bold text-white">
                    {profileForm.name
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map(
                        (part) =>
                          part[0],
                      )
                      .join("")
                      .toUpperCase() ||
                      "AO"}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {profileForm.name ||
                        "Admin Owner"}
                    </p>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Administrator
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>

                  <input
                    value={profileForm.name}
                    onChange={(event) =>
                      setProfileForm(
                        (current) => ({
                          ...current,
                          name: event
                            .target.value,
                        }),
                      )
                    }
                    placeholder="Admin Owner"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Role
                  </label>

                  <input
                    value={profileForm.role}
                    onChange={(event) =>
                      setProfileForm(
                        (current) => ({
                          ...current,
                          role: event
                            .target.value,
                        }),
                      )
                    }
                    placeholder="Owner"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Email
                  </label>

                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(event) =>
                      setProfileForm(
                        (current) => ({
                          ...current,
                          email: event
                            .target.value,
                        }),
                      )
                    }
                    placeholder="owner@example.com"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Phone
                  </label>

                  <input
                    value={profileForm.phone}
                    onChange={(event) =>
                      setProfileForm(
                        (current) => ({
                          ...current,
                          phone: event
                            .target.value,
                        }),
                      )
                    }
                    placeholder="+971..."
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/40">
                <button
                  type="button"
                  onClick={() =>
                    setProfileOpen(false)
                  }
                  className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

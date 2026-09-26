import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.PROD) {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("PWA service worker registration failed:", error)
      })
    } else {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        return Promise.all(
          registrations.map((registration) => registration.unregister()),
        )
      })

      void caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith("universal-erp-pwa-"))
            .map((key) => caches.delete(key)),
        )
      })
    }
  })
}

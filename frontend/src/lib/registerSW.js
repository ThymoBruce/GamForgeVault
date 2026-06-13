// PWA service worker registration (production only)
export function registerSW() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// Lazy-init Sentry after first paint to avoid blocking FCP
const initSentry = async () => {
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn: "https://826817d3ca7630dec16a69c2c0405cfa@o4510966648995840.ingest.us.sentry.io/4510966650568704",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.3,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    // Chunk load failures after deploys: cached HTML references old chunks; lazyWithRetry reloads
    ignoreErrors: [
      /Failed to fetch dynamically imported module/,
      /Loading chunk \d+ failed/,
      /Importing a module script failed/,
    ],
    // Strip Supabase secrets from error reports (never send service_role or anon keys to Sentry)
    beforeSend(event) {
      const SENSITIVE_KEYS = /SUPABASE_SERVICE_ROLE|SUPABASE_ANON|service_role|sb_secret|sb_publishable|password|secret|api_key|apikey/i;
      const scrub = (obj: unknown): unknown => {
        if (obj == null) return obj;
        if (Array.isArray(obj)) return obj.map(scrub);
        if (typeof obj === "object") {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj)) {
            out[k] = SENSITIVE_KEYS.test(k) ? "[Filtered]" : scrub(v);
          }
          return out;
        }
        return obj;
      };
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      return event;
    },
  });
};

// Init Sentry after idle or 2s max
if ('requestIdleCallback' in window) {
  (window as any).requestIdleCallback(() => initSentry(), { timeout: 2000 });
} else {
  setTimeout(initSentry, 1000);
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

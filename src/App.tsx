import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { SessionTimeoutProvider } from "@/components/auth/SessionTimeoutProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Eagerly load critical public pages
import LandingPage from "./pages/LandingPage";
import EmbedBookingPage from "./pages/EmbedBookingPage";
import EmbedMembershipsPage from "./pages/EmbedMembershipsPage";
import EmbedMembershipsTeaserPage from "./pages/EmbedMembershipsTeaserPage";
import EmbedCouponPopupPage from "./pages/EmbedCouponPopupPage";

// Auto-reload on stale chunk errors (after deploys, cached HTML references old chunks)
function lazyWithRetry(factory: () => Promise<any>) {
  return lazy(async () => {
    const isChunkError = (e: unknown) =>
      e instanceof Error && (
        e.message.includes('Failed to fetch dynamically imported module') ||
        e.message.includes('Loading chunk') ||
        e.message.includes('Importing a module script failed')
      );
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await factory();
      } catch (err) {
        if (!isChunkError(err)) throw err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        const key = 'chunk_reload';
        const lastReload = sessionStorage.getItem(key);
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 10000) {
          sessionStorage.setItem(key, String(now));
          window.location.reload();
        }
        throw err;
      }
    }
    throw new Error('Chunk load failed');
  });
}

// Lazy load all other pages
const Index = lazyWithRetry(() => import("./pages/Index"));
const CalendarPage = lazyWithRetry(() => import("./pages/CalendarPage"));
const PractitionersPage = lazyWithRetry(() => import("./pages/PractitionersPage"));
const RoomsPage = lazyWithRetry(() => import("./pages/RoomsPage"));
const ServicesPage = lazyWithRetry(() => import("./pages/ServicesPage"));
const BookingsPage = lazyWithRetry(() => import("./pages/BookingsPage"));
const SettingsPage = lazyWithRetry(() => import("./pages/SettingsPage"));
const BookOnlinePage = lazyWithRetry(() => import("./pages/BookOnlinePage"));
const AuthPage = lazyWithRetry(() => import("./pages/AuthPage"));
const PrivacyPage = lazyWithRetry(() => import("./pages/PrivacyPage"));
const TermsPage = lazyWithRetry(() => import("./pages/TermsPage"));
const SmsConsentPage = lazyWithRetry(() => import("./pages/SmsConsentPage"));
const SmsConsentConfirmPage = lazyWithRetry(() => import("./pages/SmsConsentConfirmPage"));
const ApproveInvitePage = lazyWithRetry(() => import("./pages/ApproveInvitePage"));
const ApproveDemoPage = lazyWithRetry(() => import("./pages/ApproveDemoPage"));
const CustomersPage = lazyWithRetry(() => import("./pages/CustomersPage"));
const MessagesPage = lazyWithRetry(() => import("./pages/MessagesPage"));
const IntakeFormsPage = lazyWithRetry(() => import("./pages/IntakeFormsPage"));
const SOAPNotesPage = lazyWithRetry(() => import("./pages/SOAPNotesPage"));
const WaitlistPage = lazyWithRetry(() => import("./pages/WaitlistPage"));
const MembershipsPage = lazyWithRetry(() => import("./pages/MembershipsPage"));
const CheckInPage = lazyWithRetry(() => import("./pages/CheckInPage"));
const BookingConfirmedPage = lazyWithRetry(() => import("./pages/BookingConfirmedPage"));
const PayBalancePage = lazyWithRetry(() => import("./pages/PayBalancePage"));
const TipPage = lazyWithRetry(() => import("./pages/TipPage"));
const MySettingsPage = lazyWithRetry(() => import("./pages/MySettingsPage"));
const BAAPage = lazyWithRetry(() => import("./pages/BAAPage"));
const AdminGuidePage = lazyWithRetry(() => import("./pages/AdminGuidePage"));
const EmailPage = lazyWithRetry(() => import("./pages/EmailPage"));
const DevDashboardPage = lazyWithRetry(() => import("./pages/DevDashboardPage"));
const TestKlaviyoPage = lazyWithRetry(() => import("./pages/TestKlaviyoPage"));
const CompletePaymentPage = lazyWithRetry(() => import("./pages/CompletePaymentPage"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 5, // 5 minutes garbage collection
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-sage" />
    </div>
  );
}

/** Routes that bypass AuthProvider / SessionTimeoutProvider for faster load */
function AppRoutes() {
  const location = useLocation();

  // Embed route renders without auth overhead for instant load
  if (location.pathname === '/embed/book') {
    return (
      <>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <EmbedBookingPage />
        </TooltipProvider>
      </>
    );
  }

  if (location.pathname === '/embed/memberships') {
    return (
      <>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <EmbedMembershipsPage />
        </TooltipProvider>
      </>
    );
  }

  if (location.pathname === '/embed/memberships-teaser') {
    return (
      <>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <EmbedMembershipsTeaserPage />
        </TooltipProvider>
      </>
    );
  }

  if (location.pathname === '/embed/coupon-popup') {
    return <EmbedCouponPopupPage />;
  }

  return (
    <AuthProvider>
      <TooltipProvider>
        <SessionTimeoutProvider>
          <Toaster />
          <Sonner />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/book" element={<BookOnlinePage />} />
              <Route path="/book-online" element={<BookOnlinePage />} />
              <Route path="/booking-confirmed" element={<BookingConfirmedPage />} />
              <Route path="/check-in" element={<CheckInPage />} />
              <Route path="/pay-balance" element={<PayBalancePage />} />
              <Route path="/tip" element={<TipPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/privacy/terms" element={<TermsPage />} />
              <Route path="/sms-consent" element={<SmsConsentPage />} />
              <Route path="/sms-consent/confirm" element={<SmsConsentConfirmPage />} />
              <Route path="/approve-invite" element={<ApproveInvitePage />} />
              <Route path="/approve-demo" element={<ApproveDemoPage />} />
              
              {/* Public landing page */}
              <Route path="/" element={<LandingPage />} />
              
              {/* Protected routes */}
              <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
              <Route path="/practitioners" element={<ProtectedRoute requireAdmin><PractitionersPage /></ProtectedRoute>} />
              <Route path="/rooms" element={<ProtectedRoute requireAdmin><RoomsPage /></ProtectedRoute>} />
              <Route path="/services" element={<ProtectedRoute requireAdmin><ServicesPage /></ProtectedRoute>} />
              <Route path="/bookings" element={<ProtectedRoute><BookingsPage /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
              <Route path="/intake-forms" element={<ProtectedRoute><IntakeFormsPage /></ProtectedRoute>} />
              <Route path="/soap-notes" element={<ProtectedRoute><SOAPNotesPage /></ProtectedRoute>} />
              <Route path="/waitlist" element={<ProtectedRoute><WaitlistPage /></ProtectedRoute>} />
              <Route path="/memberships" element={<ProtectedRoute><MembershipsPage /></ProtectedRoute>} />
              <Route path="/email" element={<ProtectedRoute requireAdmin><EmailPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute requireAdmin><SettingsPage /></ProtectedRoute>} />
              <Route path="/baa" element={<ProtectedRoute><BAAPage /></ProtectedRoute>} />
              <Route path="/admin-guide" element={<ProtectedRoute requireAdmin><AdminGuidePage /></ProtectedRoute>} />
              <Route path="/my-settings" element={<ProtectedRoute><MySettingsPage /></ProtectedRoute>} />
              <Route path="/dev" element={<ProtectedRoute requireAdmin><DevDashboardPage /></ProtectedRoute>} />
              <Route path="/complete-payment" element={<ProtectedRoute><CompletePaymentPage /></ProtectedRoute>} />
              <Route path="/test-klaviyo" element={<ProtectedRoute requireAdmin><TestKlaviyoPage /></ProtectedRoute>} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </SessionTimeoutProvider>
      </TooltipProvider>
    </AuthProvider>
  );
}

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;

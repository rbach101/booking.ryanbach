import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, CreditCard, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { safeRedirect } from '@/lib/safeRedirect';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Post height to parent so iframe can auto-resize
function usePostHeight() {
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      root.style.padding = '0';
      root.style.textAlign = 'left';
      root.style.maxWidth = '100%';
    }
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';

    const sendHeight = () => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'custom-booking-embed-height', height }, '*');
    };

    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    document.addEventListener('load', sendHeight, true);
    const timers = [100, 300, 500, 1000, 2000, 3000, 5000, 8000, 10000, 15000].map(ms => setTimeout(sendHeight, ms));
    // Also keep sending every 2 seconds for 30 seconds to catch late renders
    const interval = setInterval(sendHeight, 2000);
    const clearInt = setTimeout(() => clearInterval(interval), 30000);
    sendHeight();

    return () => {
      observer.disconnect();
      document.removeEventListener('load', sendHeight, true);
      timers.forEach(clearTimeout);
      clearInterval(interval);
      clearTimeout(clearInt);
      if (root) {
        root.style.padding = '';
        root.style.textAlign = '';
        root.style.maxWidth = '';
      }
    };
  }, []);
}

interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_period: string;
  sessions_included: number;
  discount_percentage: number | null;
  is_active: boolean;
  stripe_price_id: string | null;
}

interface SessionPackage {
  id: string;
  name: string;
  description: string | null;
  session_count: number;
  price: number;
  valid_days: number | null;
  is_active: boolean;
}

export default function EmbedMembershipsPage() {
  usePostHeight();

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [plansRes, packagesRes] = await Promise.all([
        supabase.from('membership_plans').select('*').eq('is_active', true).order('price'),
        supabase.from('session_packages').select('*').eq('is_active', true).order('price'),
      ]);
      setPlans(plansRes.data || []);
      setPackages(packagesRes.data || []);
    } catch (error) {
      console.error('Error fetching memberships:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan: MembershipPlan) => {
    if (!plan.stripe_price_id) {
      toast.error('Online checkout is not available for this plan. Please contact us to sign up.');
      return;
    }

    setSubscribingId(plan.id);
    try {
      const response = await supabase.functions.invoke('create-membership-checkout', {
        body: { planId: plan.id },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.url) {
        safeRedirect(response.data.url);
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setSubscribingId(null);
    }
  };

  const formatPrice = (price: number, period?: string) => {
    const formatted = `$${price.toFixed(0)}`;
    if (period === 'monthly') return `${formatted}/mo`;
    if (period === 'yearly') return `${formatted}/yr`;
    return formatted;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(150,35%,45%)]" />
      </div>
    );
  }

  const hasBoth = plans.length > 0 && packages.length > 0;

  return (
    <>
      <Helmet>
        <title>Memberships & Packages | Custom Booking Massage Studio</title>
        <meta name="description" content="Join an Custom Booking membership or purchase a session package to save on massage therapy." />
      </Helmet>

      <div className="min-h-screen bg-[hsl(40,30%,96%)] font-sans">
        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-[hsl(180,8%,25%)] mb-3">
              Memberships & Packages
            </h1>
            <p className="text-[hsl(180,5%,50%)] text-lg max-w-xl mx-auto">
              Save on your wellness journey with a membership or session package
            </p>
          </div>

          {hasBoth ? (
            <Tabs defaultValue="memberships" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
                <TabsTrigger value="memberships" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Memberships
                </TabsTrigger>
                <TabsTrigger value="packages" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Packages
                </TabsTrigger>
              </TabsList>
              <TabsContent value="memberships">
                <PlanCards plans={plans} subscribingId={subscribingId} onSubscribe={handleSubscribe} formatPrice={formatPrice} />
              </TabsContent>
              <TabsContent value="packages">
                <PackageCards packages={packages} formatPrice={formatPrice} />
              </TabsContent>
            </Tabs>
          ) : plans.length > 0 ? (
            <PlanCards plans={plans} subscribingId={subscribingId} onSubscribe={handleSubscribe} formatPrice={formatPrice} />
          ) : packages.length > 0 ? (
            <PackageCards packages={packages} formatPrice={formatPrice} />
          ) : (
            <div className="text-center py-16 text-[hsl(180,5%,50%)]">
              <p className="text-lg">No memberships or packages available at this time.</p>
              <p className="mt-2">Please check back later or contact us for more information.</p>
            </div>
          )}

          {/* Contact footer */}
          <div className="text-center mt-12 pt-8 border-t border-[hsl(40,20%,88%)]">
            <p className="text-sm text-[hsl(180,5%,50%)]">
              Questions? Contact us at{' '}
              <a href="mailto:support@example.com" className="text-[hsl(150,35%,45%)] hover:underline">
                support@example.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function PlanCards({
  plans,
  subscribingId,
  onSubscribe,
  formatPrice,
}: {
  plans: MembershipPlan[];
  subscribingId: string | null;
  onSubscribe: (plan: MembershipPlan) => void;
  formatPrice: (price: number, period?: string) => string;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <Card
          key={plan.id}
          className="relative overflow-hidden border-[hsl(40,20%,88%)] bg-white shadow-sm hover:shadow-md transition-shadow"
        >
          {plan.discount_percentage != null && plan.discount_percentage > 0 ? (
            <div className="absolute top-3 right-3">
              <Badge className="bg-[hsl(150,35%,45%)] text-white text-xs">
                Save {plan.discount_percentage}%
              </Badge>
            </div>
          ) : null}
          <CardHeader className="pb-4">
            <CardTitle className="text-xl text-[hsl(180,8%,25%)]">{plan.name}</CardTitle>
            {plan.description && (
              <CardDescription className="text-[hsl(180,5%,50%)]">{plan.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <span className="text-4xl font-bold text-[hsl(180,8%,25%)]">
                ${plan.price.toFixed(0)}
              </span>
              <span className="text-[hsl(180,5%,50%)] ml-1">
                /{plan.billing_period === 'monthly' ? 'mo' : 'yr'}
              </span>
            </div>

            <ul className="space-y-2.5">
              <li className="flex items-start gap-2 text-sm text-[hsl(180,8%,35%)]">
                <Check className="h-4 w-4 mt-0.5 text-[hsl(150,35%,45%)] shrink-0" />
                {plan.sessions_included} session{plan.sessions_included > 1 ? 's' : ''} per {plan.billing_period === 'monthly' ? 'month' : 'year'}
              </li>
              <li className="flex items-start gap-2 text-sm text-[hsl(180,8%,35%)]">
                <Check className="h-4 w-4 mt-0.5 text-[hsl(150,35%,45%)] shrink-0" />
                Recurring {plan.billing_period} billing
              </li>
              <li className="flex items-start gap-2 text-sm text-[hsl(180,8%,35%)]">
                <Check className="h-4 w-4 mt-0.5 text-[hsl(150,35%,45%)] shrink-0" />
                Cancel anytime
              </li>
            </ul>

            {/* Autocharge agreement disclosure */}
            <p className="text-xs text-[hsl(180,5%,55%)] leading-relaxed border-t border-[hsl(40,20%,90%)] pt-3">
              By subscribing, you agree to be automatically charged <strong>${plan.price.toFixed(0)}/{plan.billing_period === 'monthly' ? 'month' : 'year'}</strong> until you cancel. 
              You may cancel at any time before your next billing date to stop future charges. No refunds for the current billing period.
            </p>

            <Button
              className="w-full bg-[hsl(150,35%,45%)] hover:bg-[hsl(150,35%,38%)] text-white"
              onClick={() => onSubscribe(plan)}
              disabled={subscribingId === plan.id}
            >
              {subscribingId === plan.id ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              {subscribingId === plan.id ? 'Starting checkout...' : 'Subscribe Now'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PackageCards({
  packages,
  formatPrice,
}: {
  packages: SessionPackage[];
  formatPrice: (price: number) => string;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => {
        const perSession = pkg.price / pkg.session_count;
        return (
          <Card
            key={pkg.id}
            className="relative overflow-hidden border-[hsl(40,20%,88%)] bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            <CardHeader className="pb-4">
              <CardTitle className="text-xl text-[hsl(180,8%,25%)]">{pkg.name}</CardTitle>
              {pkg.description && (
                <CardDescription className="text-[hsl(180,5%,50%)]">{pkg.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <span className="text-4xl font-bold text-[hsl(180,8%,25%)]">
                  ${pkg.price.toFixed(0)}
                </span>
                <span className="text-[hsl(180,5%,50%)] ml-2 text-sm">
                  (${perSession.toFixed(0)}/session)
                </span>
              </div>

              <ul className="space-y-2.5">
                <li className="flex items-start gap-2 text-sm text-[hsl(180,8%,35%)]">
                  <Check className="h-4 w-4 mt-0.5 text-[hsl(150,35%,45%)] shrink-0" />
                  {pkg.session_count} sessions included
                </li>
                {pkg.valid_days && (
                  <li className="flex items-start gap-2 text-sm text-[hsl(180,8%,35%)]">
                    <Check className="h-4 w-4 mt-0.5 text-[hsl(150,35%,45%)] shrink-0" />
                    Valid for {pkg.valid_days} days
                  </li>
                )}
                <li className="flex items-start gap-2 text-sm text-[hsl(180,8%,35%)]">
                  <Check className="h-4 w-4 mt-0.5 text-[hsl(150,35%,45%)] shrink-0" />
                  One-time purchase
                </li>
              </ul>

              <Button
                className="w-full bg-[hsl(150,35%,45%)] hover:bg-[hsl(150,35%,38%)] text-white"
                onClick={() => {
                  toast.info('Please contact us to purchase this package.');
                }}
              >
                <Package className="h-4 w-4 mr-2" />
                Contact to Purchase
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

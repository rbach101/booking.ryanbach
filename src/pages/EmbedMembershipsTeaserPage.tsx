import { useState, useEffect } from 'react';
import { Loader2, CreditCard, Package, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const MEMBER_PAGE_URL = 'https://example.com/member';

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
    const timers = [100, 300, 500, 1000, 2000, 3000].map(ms => setTimeout(sendHeight, ms));
    sendHeight();

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
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
  price: number;
  billing_period: string;
  sessions_included: number;
}

interface SessionPackage {
  id: string;
  name: string;
  session_count: number;
  price: number;
}

const MAX_PLANS = 3;
const MAX_PACKAGES = 3;

export default function EmbedMembershipsTeaserPage() {
  usePostHeight();

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, packagesRes] = await Promise.all([
          supabase.from('membership_plans').select('id, name, price, billing_period, sessions_included').eq('is_active', true).order('price').limit(MAX_PLANS),
          supabase.from('session_packages').select('id, name, session_count, price').eq('is_active', true).order('price').limit(MAX_PACKAGES),
        ]);
        setPlans(plansRes.data || []);
        setPackages(packagesRes.data || []);
      } catch (error) {
        console.error('Error fetching memberships:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatPrice = (price: number, period?: string) => {
    const formatted = `$${price.toFixed(0)}`;
    if (period === 'monthly') return `${formatted}/mo`;
    if (period === 'yearly') return `${formatted}/yr`;
    return formatted;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[120px]">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(150,35%,45%)]" />
      </div>
    );
  }

  const hasAny = plans.length > 0 || packages.length > 0;

  return (
    <div className="bg-[hsl(40,30%,96%)] font-sans px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xl font-bold text-[hsl(180,8%,25%)] mb-4">
          Memberships & Packages
        </h2>
        <p className="text-sm text-[hsl(180,5%,50%)] mb-5">
          Save on your wellness journey with a membership or session package
        </p>

        {hasAny ? (
          <>
            <div className="space-y-4">
              {plans.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[hsl(180,8%,35%)] mb-2 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[hsl(150,35%,45%)]" />
                    Memberships
                  </h3>
                  <ul className="space-y-1.5">
                    {plans.map((plan) => (
                      <li key={plan.id} className="flex justify-between items-baseline text-sm">
                        <span className="text-[hsl(180,8%,25%)]">{plan.name}</span>
                        <span className="text-[hsl(180,5%,50%)]">
                          {formatPrice(plan.price, plan.billing_period)} · {plan.sessions_included} session{plan.sessions_included > 1 ? 's' : ''}/{plan.billing_period === 'monthly' ? 'mo' : 'yr'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {packages.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[hsl(180,8%,35%)] mb-2 flex items-center gap-2">
                    <Package className="h-4 w-4 text-[hsl(150,35%,45%)]" />
                    Packages
                  </h3>
                  <ul className="space-y-1.5">
                    {packages.map((pkg) => (
                      <li key={pkg.id} className="flex justify-between items-baseline text-sm">
                        <span className="text-[hsl(180,8%,25%)]">{pkg.name}</span>
                        <span className="text-[hsl(180,5%,50%)]">
                          ${pkg.price.toFixed(0)} · {pkg.session_count} sessions
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <a
              href={MEMBER_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-[hsl(150,35%,45%)] font-semibold text-sm hover:underline"
            >
              View all memberships & packages
              <ArrowRight className="h-4 w-4" />
            </a>
          </>
        ) : (
          <a
            href={MEMBER_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[hsl(150,35%,45%)] font-semibold text-sm hover:underline"
          >
            View memberships & packages
            <ArrowRight className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

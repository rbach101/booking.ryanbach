import { useState, useMemo } from 'react';
import { Search, CreditCard, Package, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SellMembershipDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_period: string;
  sessions_included: number;
  is_active: boolean;
}

interface SessionPackage {
  id: string;
  name: string;
  description: string | null;
  session_count: number;
  price: number;
  valid_days: number;
  is_active: boolean;
}

export function SellMembershipDialog({ trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange }: SellMembershipDialogProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange || (() => {})) : setInternalOpen;

  const [tab, setTab] = useState<'membership' | 'package'>('membership');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ['sell-membership-customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').order('last_name');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['sell-membership-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data as MembershipPlan[];
    },
    enabled: open,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['sell-membership-packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_packages')
        .select('*')
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data as SessionPackage[];
    },
    enabled: open,
  });

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) return customers.slice(0, 10);
    const q = customerSearchQuery.toLowerCase();
    return customers
      .filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
      )
      .slice(0, 10);
  }, [customers, customerSearchQuery]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const selectedPackage = packages.find(p => p.id === selectedPackageId);

  const totalPrice = tab === 'membership' ? selectedPlan?.price : selectedPackage?.price;

  const handleReset = () => {
    setTab('membership');
    setCustomerSearchOpen(false);
    setCustomerSearchQuery('');
    setSelectedCustomerId(null);
    setClientName('');
    setClientEmail('');
    setSelectedPlanId(null);
    setSelectedPackageId(null);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }

    if (tab === 'membership') {
      if (!selectedPlanId) { toast.error('Please select a membership plan'); return; }

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-membership-checkout', {
          body: { planId: selectedPlanId, customerId: selectedCustomerId },
        });
        if (error) throw new Error(await getFunctionErrorMessage(error));
        if (data?.url) {
          window.open(data.url, '_blank');
          toast.success('Stripe checkout opened — complete payment to activate membership.');
          setOpen(false);
          handleReset();
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to create checkout');
      } finally {
        setLoading(false);
      }
    } else {
      if (!selectedPackageId) { toast.error('Please select a session package'); return; }

      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-package-checkout', {
          body: { packageId: selectedPackageId, customerId: selectedCustomerId },
        });
        if (error) throw new Error(await getFunctionErrorMessage(error));
        if (data?.url) {
          window.open(data.url, '_blank');
          toast.success('Stripe checkout opened — complete payment to activate package.');
          setOpen(false);
          handleReset();
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to create checkout');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleReset(); }}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Sell Membership / Package</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {/* Customer Section */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Client</h4>

            {/* Customer Search */}
            <div className="space-y-2">
              <Label>Search Existing Customer</Label>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal', !selectedCustomerId && 'text-muted-foreground')}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {selectedCustomerId
                      ? customers.find(c => c.id === selectedCustomerId)
                        ? `${customers.find(c => c.id === selectedCustomerId)!.first_name} ${customers.find(c => c.id === selectedCustomerId)!.last_name}`
                        : clientName || 'Customer selected'
                      : 'Search customers...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search by name, email, or phone..."
                      value={customerSearchQuery}
                      onValueChange={setCustomerSearchQuery}
                    />
                    <CommandList className="max-h-60 overflow-y-auto">
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {filteredCustomers.map(customer => (
                          <CommandItem
                            key={customer.id}
                            value={`${customer.first_name} ${customer.last_name} ${customer.email}`}
                            onSelect={() => {
                              setSelectedCustomerId(customer.id);
                              setClientName(`${customer.first_name} ${customer.last_name}`);
                              setClientEmail(customer.email);
                              setCustomerSearchOpen(false);
                              setCustomerSearchQuery('');
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                              <span className="text-xs text-muted-foreground">{customer.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Full Name</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientEmail">Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="jane@email.com"
                  required
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Membership / Package Selection */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Select Plan or Package</h4>

            <Tabs value={tab} onValueChange={(v) => { setTab(v as 'membership' | 'package'); setSelectedPlanId(null); setSelectedPackageId(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="membership" className="flex-1 gap-2">
                  <Sparkles className="w-4 h-4" />
                  Membership
                </TabsTrigger>
                <TabsTrigger value="package" className="flex-1 gap-2">
                  <Package className="w-4 h-4" />
                  Session Package
                </TabsTrigger>
              </TabsList>

              <TabsContent value="membership" className="mt-4 space-y-3">
                {plans.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No active membership plans.</p>
                ) : (
                  plans.map(plan => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={cn(
                        'w-full text-left rounded-lg border p-4 transition-colors',
                        selectedPlanId === plan.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50 hover:bg-secondary/30'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{plan.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {plan.sessions_included} session{plan.sessions_included !== 1 ? 's' : ''}/{plan.billing_period}
                            </Badge>
                          </div>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground">{plan.description}</p>
                          )}
                        </div>
                        <span className="font-semibold text-lg whitespace-nowrap">${plan.price.toFixed(2)}</span>
                      </div>
                    </button>
                  ))
                )}
              </TabsContent>

              <TabsContent value="package" className="mt-4 space-y-3">
                {packages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No active session packages.</p>
                ) : (
                  packages.map(pkg => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPackageId(pkg.id)}
                      className={cn(
                        'w-full text-left rounded-lg border p-4 transition-colors',
                        selectedPackageId === pkg.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50 hover:bg-secondary/30'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{pkg.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {pkg.session_count} session{pkg.session_count !== 1 ? 's' : ''}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {pkg.valid_days} days
                            </Badge>
                          </div>
                          {pkg.description && (
                            <p className="text-xs text-muted-foreground">{pkg.description}</p>
                          )}
                        </div>
                        <span className="font-semibold text-lg whitespace-nowrap">${pkg.price.toFixed(2)}</span>
                      </div>
                    </button>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Charge in Full */}
          {totalPrice !== undefined && (
            <>
              <Separator />
              <div className="flex items-start space-x-3 rounded-lg border border-primary/30 p-4 bg-primary/5">
                <CreditCard className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">Charge in Full</p>
                  <p className="text-sm text-muted-foreground">
                    Opens a Stripe checkout for the full amount of{' '}
                    <strong>${totalPrice.toFixed(2)}</strong>.
                    {tab === 'membership' && ' Activates a recurring subscription.'}
                    {tab === 'package' && ' Sessions are activated immediately upon payment.'}
                  </p>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setOpen(false); handleReset(); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sage"
              disabled={
                loading ||
                !selectedCustomerId ||
                (tab === 'membership' && !selectedPlanId) ||
                (tab === 'package' && !selectedPackageId)
              }
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Opening Checkout...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Charge in Full – ${totalPrice?.toFixed(2) ?? '0.00'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

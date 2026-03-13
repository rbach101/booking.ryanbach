import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, CreditCard, Package, Users, Edit2, Trash2, ExternalLink, Loader2, Send, CheckCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_period: string;
  sessions_included: number;
  discount_percentage: number;
  is_active: boolean;
  service_ids: string[];
  stripe_price_id: string | null;
  stripe_product_id: string | null;
}

interface SessionPackage {
  id: string;
  name: string;
  description: string | null;
  session_count: number;
  price: number;
  valid_days: number;
  is_active: boolean;
  service_ids: string[];
}

interface CustomerPackage {
  id: string;
  customer_id: string;
  package_id: string;
  sessions_remaining: number;
  sessions_used: number;
  purchase_date: string;
  expires_at: string | null;
  status: string;
  customers?: { first_name: string; last_name: string; email: string };
  session_packages?: { name: string; price: number };
}

interface CustomerMembership {
  id: string;
  customer_id: string;
  plan_id: string;
  status: string;
  start_date: string;
  next_billing_date: string | null;
  sessions_remaining: number;
  sessions_used: number;
  customers?: { first_name: string; last_name: string; email: string };
  membership_plans?: { name: string; price: number };
}

export default function MembershipsPage() {
  const [activeTab, setActiveTab] = useState('plans');
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [memberships, setMemberships] = useState<CustomerMembership[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Plan dialog state
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const [planPeriod, setPlanPeriod] = useState('monthly');
  const [planSessions, setPlanSessions] = useState('1');
  const [planDiscount, setPlanDiscount] = useState('0');

  // Package dialog state
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SessionPackage | null>(null);
  const [packageName, setPackageName] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [packageCount, setPackageCount] = useState('5');
  const [packagePrice, setPackagePrice] = useState('');
  const [packageValidDays, setPackageValidDays] = useState('365');
  
  // Add member dialog state
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [selectedPlanForMember, setSelectedPlanForMember] = useState<MembershipPlan | null>(null);
  const [customers, setCustomers] = useState<{ id: string; first_name: string; last_name: string; email: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [sendingMembershipLink, setSendingMembershipLink] = useState(false);
  
  // Add package member dialog state
  const [addPackageMemberDialogOpen, setAddPackageMemberDialogOpen] = useState(false);
  const [selectedPackageForMember, setSelectedPackageForMember] = useState<SessionPackage | null>(null);
  const [addingPackageMember, setAddingPackageMember] = useState(false);
  const [subscribingPackageId, setSubscribingPackageId] = useState<string | null>(null);
  const [sendingPackageLink, setSendingPackageLink] = useState(false);
  const [customerPackages, setCustomerPackages] = useState<CustomerPackage[]>([]);

  const [deletePlanDialogOpen, setDeletePlanDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<MembershipPlan | null>(null);
  const [deletePackageDialogOpen, setDeletePackageDialogOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<SessionPackage | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    fetchData();
  }, []);

  // Handle purchase confirmation from URL params
  useEffect(() => {
    const packagePurchased = searchParams.get('package_purchased');
    const planPurchased = searchParams.get('plan');
    
    if (packagePurchased) {
      toast.success('Package purchased successfully! Sessions have been activated.', {
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        duration: 5000,
      });
      // Clean up URL params
      searchParams.delete('package_purchased');
      searchParams.delete('customer');
      setSearchParams(searchParams, { replace: true });
      fetchData();
    }
    
    if (planPurchased) {
      toast.success('Membership subscription activated successfully!', {
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        duration: 5000,
      });
      searchParams.delete('plan');
      searchParams.delete('customer');
      setSearchParams(searchParams, { replace: true });
      setActiveTab('members');
      fetchData();
    }
  }, [searchParams]);

  const fetchData = async () => {
    try {
      const [plansRes, packagesRes, membershipsRes, customerPackagesRes, customersRes] = await Promise.all([
        supabase.from('membership_plans').select('*').order('created_at'),
        supabase.from('session_packages').select('*').order('created_at'),
        supabase.from('customer_memberships').select(`
          *,
          customers(first_name, last_name, email),
          membership_plans(name, price)
        `).order('created_at', { ascending: false }),
        supabase.from('customer_packages').select(`
          *,
          customers(first_name, last_name, email),
          session_packages(name, price)
        `).order('created_at', { ascending: false }),
        supabase.from('customers').select('id, first_name, last_name, email').order('first_name'),
      ]);

      if (plansRes.error) throw plansRes.error;
      if (packagesRes.error) throw packagesRes.error;
      if (membershipsRes.error) throw membershipsRes.error;
      if (customerPackagesRes.error) throw customerPackagesRes.error;

      setPlans(plansRes.data || []);
      setPackages(packagesRes.data || []);
      setMemberships(membershipsRes.data || []);
      setCustomerPackages(customerPackagesRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load memberships');
    } finally {
      setLoading(false);
    }
  };

  // Plan handlers
  const resetPlanForm = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanDescription('');
    setPlanPrice('');
    setPlanPeriod('monthly');
    setPlanSessions('1');
    setPlanDiscount('0');
  };

  const handleCreatePlan = () => {
    resetPlanForm();
    setPlanDialogOpen(true);
  };

  const handleEditPlan = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanDescription(plan.description || '');
    setPlanPrice(plan.price.toString());
    setPlanPeriod(plan.billing_period);
    setPlanSessions(plan.sessions_included.toString());
    setPlanDiscount((plan.discount_percentage ?? 0).toString());
    setPlanDialogOpen(true);
  };

  const handleSavePlan = async () => {
    if (!planName.trim() || !planPrice) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      const planData = {
        name: planName,
        description: planDescription || null,
        price: parseFloat(planPrice),
        billing_period: planPeriod,
        sessions_included: parseInt(planSessions),
        discount_percentage: parseInt(planDiscount),
        is_active: true,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from('membership_plans')
          .update(planData)
          .eq('id', editingPlan.id);
        if (error) throw error;
        toast.success('Plan updated');
      } else {
        const { error } = await supabase
          .from('membership_plans')
          .insert(planData);
        if (error) throw error;
        toast.success('Plan created');
      }

      setPlanDialogOpen(false);
      resetPlanForm();
      fetchData();
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error('Failed to save plan');
    }
  };

  const openDeletePlanDialog = (plan: MembershipPlan) => {
    setPlanToDelete(plan);
    setDeletePlanDialogOpen(true);
  };

  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    const id = planToDelete.id;
    setDeletePlanDialogOpen(false);
    setPlanToDelete(null);
    try {
      const { error } = await supabase.from('membership_plans').delete().eq('id', id);
      if (error) throw error;
      toast.success('Plan deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete plan');
    }
  };

  // Package handlers
  const resetPackageForm = () => {
    setEditingPackage(null);
    setPackageName('');
    setPackageDescription('');
    setPackageCount('5');
    setPackagePrice('');
    setPackageValidDays('365');
  };

  const handleCreatePackage = () => {
    resetPackageForm();
    setPackageDialogOpen(true);
  };

  const handleEditPackage = (pkg: SessionPackage) => {
    setEditingPackage(pkg);
    setPackageName(pkg.name);
    setPackageDescription(pkg.description || '');
    setPackageCount(pkg.session_count.toString());
    setPackagePrice(pkg.price.toString());
    setPackageValidDays(pkg.valid_days.toString());
    setPackageDialogOpen(true);
  };

  const handleSavePackage = async () => {
    if (!packageName.trim() || !packagePrice) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      const packageData = {
        name: packageName,
        description: packageDescription || null,
        session_count: parseInt(packageCount),
        price: parseFloat(packagePrice),
        valid_days: parseInt(packageValidDays),
        is_active: true,
      };

      if (editingPackage) {
        const { error } = await supabase
          .from('session_packages')
          .update(packageData)
          .eq('id', editingPackage.id);
        if (error) throw error;
        toast.success('Package updated');
      } else {
        const { error } = await supabase
          .from('session_packages')
          .insert(packageData);
        if (error) throw error;
        toast.success('Package created');
      }

      setPackageDialogOpen(false);
      resetPackageForm();
      fetchData();
    } catch (error) {
      console.error('Error saving package:', error);
      toast.error('Failed to save package');
    }
  };

  const openDeletePackageDialog = (pkg: SessionPackage) => {
    setPackageToDelete(pkg);
    setDeletePackageDialogOpen(true);
  };

  const handleDeletePackage = async () => {
    if (!packageToDelete) return;
    const id = packageToDelete.id;
    setDeletePackageDialogOpen(false);
    setPackageToDelete(null);
    try {
      const { error } = await supabase.from('session_packages').delete().eq('id', id);
      if (error) throw error;
      toast.success('Package deleted');
      fetchData();
    } catch (error) {
      toast.error('Failed to delete package');
    }
  };

  const handleOpenAddMember = (plan: MembershipPlan) => {
    setSelectedPlanForMember(plan);
    setSelectedCustomerId('');
    setAddMemberDialogOpen(true);
  };

  const handleOpenAddPackageMember = (pkg: SessionPackage) => {
    setSelectedPackageForMember(pkg);
    setSelectedCustomerId('');
    setAddPackageMemberDialogOpen(true);
  };

  const handleAddMemberCheckout = async () => {
    if (!selectedPlanForMember) return;
    
    if (!selectedPlanForMember.stripe_price_id) {
      toast.error('This plan is not set up for online payments. Use "Add Manually" instead.');
      return;
    }

    if (!selectedCustomerId || selectedCustomerId === 'new') {
      toast.error('Please select a customer for Stripe checkout');
      return;
    }

    setSubscribingPlanId(selectedPlanForMember.id);
    
    try {
      const response = await supabase.functions.invoke('create-membership-checkout', {
        body: {
          planId: selectedPlanForMember.id,
          customerId: selectedCustomerId,
        },
      });

      if (response.error) {
        throw new Error(await getFunctionErrorMessage(response.error));
      }

      if (response.data?.url) {
        window.open(response.data.url, '_blank');
        setAddMemberDialogOpen(false);
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start subscription');
    } finally {
      setSubscribingPlanId(null);
    }
  };

  const handleAddMemberManually = async () => {
    if (!selectedPlanForMember) return;
    
    if (!selectedCustomerId || selectedCustomerId === 'new') {
      toast.error('Please select a customer');
      return;
    }

    setAddingMember(true);
    
    try {
      const nextBillingDate = new Date();
      if (selectedPlanForMember.billing_period === 'monthly') {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      } else if (selectedPlanForMember.billing_period === 'yearly') {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      }

      const { error } = await supabase.from('customer_memberships').insert({
        customer_id: selectedCustomerId,
        plan_id: selectedPlanForMember.id,
        status: 'active',
        sessions_remaining: selectedPlanForMember.sessions_included,
        sessions_used: 0,
        next_billing_date: nextBillingDate.toISOString().split('T')[0],
      });

      if (error) throw error;
      
      toast.success('Member added successfully');
      setAddMemberDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleAddPackageMemberManually = async () => {
    if (!selectedPackageForMember) return;
    
    if (!selectedCustomerId || selectedCustomerId === 'new') {
      toast.error('Please select a customer');
      return;
    }

    setAddingPackageMember(true);
    
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (selectedPackageForMember.valid_days || 365));

      const { error } = await supabase.from('customer_packages').insert({
        customer_id: selectedCustomerId,
        package_id: selectedPackageForMember.id,
        sessions_remaining: selectedPackageForMember.session_count,
        sessions_used: 0,
        status: 'active',
        expires_at: expiresAt.toISOString().split('T')[0],
      });

      if (error) throw error;
      
      toast.success('Package assigned successfully');
      setAddPackageMemberDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error adding package:', error);
      toast.error('Failed to assign package');
    } finally {
      setAddingPackageMember(false);
    }
  };

  const handlePackageCheckout = async (sendLink = false) => {
    if (!selectedPackageForMember) return;
    
    if (!selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }

    if (sendLink) {
      setSendingPackageLink(true);
    } else {
      setSubscribingPackageId(selectedPackageForMember.id);
    }
    
    try {
      const response = await supabase.functions.invoke('create-package-checkout', {
        body: {
          packageId: selectedPackageForMember.id,
          customerId: selectedCustomerId,
          sendPaymentLink: sendLink,
        },
      });

      if (response.error) {
        throw new Error(await getFunctionErrorMessage(response.error));
      }

      if (sendLink) {
        toast.success('Payment link sent to customer!');
        setAddPackageMemberDialogOpen(false);
      } else if (response.data?.url) {
        window.open(response.data.url, '_blank');
        setAddPackageMemberDialogOpen(false);
      }
    } catch (error) {
      console.error('Error creating package checkout:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create payment');
    } finally {
      setSubscribingPackageId(null);
      setSendingPackageLink(false);
    }
  };

  const handleSendMembershipPaymentLink = async () => {
    if (!selectedPlanForMember) return;
    
    if (!selectedPlanForMember.stripe_price_id) {
      toast.error('This plan needs a Stripe price ID configured first');
      return;
    }

    if (!selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }

    setSendingMembershipLink(true);
    
    try {
      // Get customer email for the link email
      const customer = customers.find(c => c.id === selectedCustomerId);
      
      const response = await supabase.functions.invoke('create-membership-checkout', {
        body: {
          planId: selectedPlanForMember.id,
          customerId: selectedCustomerId,
        },
      });

      if (response.error) {
        throw new Error(await getFunctionErrorMessage(response.error));
      }

      // Send the checkout URL via email
      if (response.data?.url && customer?.email) {
        await supabase.functions.invoke('send-custom-email', {
          body: {
            to: customer.email,
            subject: `Subscribe to ${selectedPlanForMember.name}`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #5c4a3a;">Your ${selectedPlanForMember.name} Membership</h2>
                <p>Aloha ${customer.first_name},</p>
                <p>Here is your link to subscribe to the <strong>${selectedPlanForMember.name}</strong> membership:</p>
                <ul>
                  <li><strong>${selectedPlanForMember.sessions_included} session${selectedPlanForMember.sessions_included > 1 ? 's' : ''}/month</strong></li>
                  <li><strong>$${selectedPlanForMember.price}/${selectedPlanForMember.billing_period}</strong></li>
                </ul>
                <p style="text-align: center; margin: 30px 0;">
                  <a href="${response.data.url}" style="background-color: #5c4a3a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px;">
                    Subscribe Now
                  </a>
                </p>
                <p style="color: #888; font-size: 13px;">If you have any questions, reply to this email or contact us at support@example.com</p>
                <p>Thanks,<br/>Custom Booking</p>
              </div>
            `,
          },
        });
        toast.success('Payment link sent to customer!');
        setAddMemberDialogOpen(false);
      }
    } catch (error) {
      console.error('Error sending membership link:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send payment link');
    } finally {
      setSendingMembershipLink(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const response = await supabase.functions.invoke('customer-portal');

      if (response.error) {
        throw new Error(await getFunctionErrorMessage(response.error));
      }

      if (response.data?.url) {
        window.open(response.data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening portal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open subscription management');
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Memberships & Packages</h1>
          <p className="text-muted-foreground mt-1">Manage recurring memberships and session bundles</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="plans" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Membership Plans
            </TabsTrigger>
            <TabsTrigger value="packages" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Session Packages
            </TabsTrigger>
            <TabsTrigger value="members" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Members
              {memberships.filter(m => m.status === 'active').length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{memberships.filter(m => m.status === 'active').length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="package-holders" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Package Holders
              {customerPackages.filter(cp => cp.status === 'active').length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{customerPackages.filter(cp => cp.status === 'active').length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Membership Plans Tab */}
          <TabsContent value="plans" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleCreatePlan}>
                <Plus className="h-4 w-4 mr-2" />
                New Plan
              </Button>
            </div>

            {plans.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No membership plans</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create recurring membership plans for regular clients.
                  </p>
                  <Button onClick={handleCreatePlan}>Create Plan</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                  <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <CardDescription>{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        <div className="text-2xl font-bold">
                          ${plan.price}
                          <span className="text-sm font-normal text-muted-foreground">
                            /{plan.billing_period}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {plan.sessions_included} session{plan.sessions_included > 1 ? 's' : ''} included
                        </div>
                        {plan.discount_percentage > 0 && (
                          <Badge variant="secondary">{plan.discount_percentage}% off additional services</Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {plan.is_active && (
                          <Button 
                            size="sm" 
                            onClick={() => handleOpenAddMember(plan)}
                            className="w-full"
                          >
                            <Users className="h-4 w-4 mr-1" />
                            Add Member
                          </Button>
                        )}
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditPlan(plan)}>
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" aria-label="Delete plan" onClick={() => openDeletePlanDialog(plan)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Session Packages Tab */}
          <TabsContent value="packages" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleCreatePackage}>
                <Plus className="h-4 w-4 mr-2" />
                New Package
              </Button>
            </div>

            {packages.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No session packages</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create prepaid session bundles for clients.
                  </p>
                  <Button onClick={handleCreatePackage}>Create Package</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {packages.map((pkg) => (
                  <Card key={pkg.id} className={!pkg.is_active ? 'opacity-60' : ''}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{pkg.name}</CardTitle>
                        <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                          {pkg.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <CardDescription>{pkg.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 mb-4">
                        <div className="text-2xl font-bold">${pkg.price}</div>
                        <div className="text-sm text-muted-foreground">
                          {pkg.session_count} sessions
                          <span className="text-muted-foreground/60"> (${(pkg.price / pkg.session_count).toFixed(0)}/session)</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Valid for {pkg.valid_days} days
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {pkg.is_active && (
                          <Button 
                            size="sm" 
                            onClick={() => handleOpenAddPackageMember(pkg)}
                            className="w-full"
                          >
                            <Users className="h-4 w-4 mr-1" />
                            Add Member
                          </Button>
                        )}
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditPackage(pkg)}>
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" aria-label="Delete package" onClick={() => openDeletePackageDialog(pkg)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Active Members Tab */}
          <TabsContent value="members" className="space-y-4">
            {memberships.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No active members</h3>
                  <p className="text-muted-foreground text-center">
                    Members will appear here when they subscribe to a plan.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {memberships.map((membership) => (
                  <Card key={membership.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {membership.customers?.first_name} {membership.customers?.last_name}
                          </CardTitle>
                          <CardDescription>{membership.customers?.email}</CardDescription>
                        </div>
                        <Badge variant={membership.status === 'active' ? 'default' : 'secondary'}>
                          {membership.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Plan:</span>
                          <span>{membership.membership_plans?.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sessions:</span>
                          <span>{membership.sessions_remaining} remaining ({membership.sessions_used} used)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Started:</span>
                          <span>{format(new Date(membership.start_date), 'MMM d, yyyy')}</span>
                        </div>
                        {membership.next_billing_date && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Next billing:</span>
                            <span>{format(new Date(membership.next_billing_date), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3 w-full"
                          onClick={handleManageSubscription}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Manage Subscription
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Package Holders Tab */}
          <TabsContent value="package-holders" className="space-y-4">
            {customerPackages.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No package holders</h3>
                  <p className="text-muted-foreground text-center">
                    Customers with purchased session packages will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {customerPackages.map((cp) => (
                  <Card key={cp.id} className={cp.status !== 'active' ? 'opacity-60' : ''}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {cp.customers?.first_name} {cp.customers?.last_name}
                          </CardTitle>
                          <CardDescription>{cp.customers?.email}</CardDescription>
                        </div>
                        <Badge variant={cp.status === 'active' ? 'default' : 'secondary'}>
                          {cp.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Package:</span>
                          <span>{cp.session_packages?.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sessions:</span>
                          <span>{cp.sessions_remaining} remaining ({cp.sessions_used} used)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Purchased:</span>
                          <span>{format(new Date(cp.purchase_date), 'MMM d, yyyy')}</span>
                        </div>
                        {cp.expires_at && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Expires:</span>
                            <span>{format(new Date(cp.expires_at), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Plan Dialog */}
        <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingPlan ? 'Edit Plan' : 'New Membership Plan'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Plan Name</Label>
                <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g., Monthly Wellness" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} rows={2} />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div>
                  <Label>Price ($)</Label>
                  <Input type="number" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} />
                </div>
                <div>
                  <Label>Billing Period</Label>
                  <Select value={planPeriod} onValueChange={setPlanPeriod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div>
                  <Label>Sessions Included</Label>
                  <Input type="number" value={planSessions} onChange={(e) => setPlanSessions(e.target.value)} />
                </div>
                <div>
                  <Label>Discount %</Label>
                  <Input type="number" value={planDiscount} onChange={(e) => setPlanDiscount(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSavePlan}>{editingPlan ? 'Update' : 'Create'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Package Dialog */}
        <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingPackage ? 'Edit Package' : 'New Session Package'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Package Name</Label>
                <Input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="e.g., 5-Session Bundle" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={packageDescription} onChange={(e) => setPackageDescription(e.target.value)} rows={2} />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div>
                  <Label>Number of Sessions</Label>
                  <Input type="number" value={packageCount} onChange={(e) => setPackageCount(e.target.value)} />
                </div>
                <div>
                  <Label>Price ($)</Label>
                  <Input type="number" value={packagePrice} onChange={(e) => setPackagePrice(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Valid Days</Label>
                <Input type="number" value={packageValidDays} onChange={(e) => setPackageValidDays(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setPackageDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSavePackage}>{editingPackage ? 'Update' : 'Create'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Member Dialog */}
        <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Member to {selectedPlanForMember?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Select Customer *</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.first_name} {customer.last_name} - {customer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/50 p-3 rounded-md">
                <div className="text-sm font-medium">{selectedPlanForMember?.name}</div>
                <div className="text-lg font-bold">
                  ${selectedPlanForMember?.price}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{selectedPlanForMember?.billing_period}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedPlanForMember?.sessions_included} session{(selectedPlanForMember?.sessions_included ?? 0) > 1 ? 's' : ''} included
                </div>
              </div>
              <div className="flex justify-end gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>Cancel</Button>
                <Button 
                  variant="secondary"
                  onClick={handleAddMemberManually}
                  disabled={addingMember || !selectedCustomerId}
                >
                  {addingMember ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Users className="h-4 w-4 mr-2" />
                  )}
                  Add Manually
                </Button>
                {selectedPlanForMember?.stripe_price_id && (
                  <>
                    <Button 
                      variant="outline"
                      onClick={handleSendMembershipPaymentLink}
                      disabled={sendingMembershipLink || !selectedCustomerId}
                    >
                      {sendingMembershipLink ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send Link
                    </Button>
                    <Button 
                      onClick={handleAddMemberCheckout}
                      disabled={subscribingPlanId === selectedPlanForMember?.id || !selectedCustomerId}
                    >
                      {subscribingPlanId === selectedPlanForMember?.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                      )}
                      Stripe Checkout
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Package Member Dialog */}
        <Dialog open={addPackageMemberDialogOpen} onOpenChange={setAddPackageMemberDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign {selectedPackageForMember?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Select Customer *</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.first_name} {customer.last_name} - {customer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/50 p-3 rounded-md">
                <div className="text-sm font-medium">{selectedPackageForMember?.name}</div>
                <div className="text-lg font-bold">${selectedPackageForMember?.price}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedPackageForMember?.session_count} sessions • Valid for {selectedPackageForMember?.valid_days} days
                </div>
              </div>
              <div className="flex justify-end gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setAddPackageMemberDialogOpen(false)}>Cancel</Button>
                <Button 
                  variant="secondary"
                  onClick={handleAddPackageMemberManually}
                  disabled={addingPackageMember || !selectedCustomerId}
                >
                  {addingPackageMember ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Users className="h-4 w-4 mr-2" />
                  )}
                  Add Manually
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handlePackageCheckout(true)}
                  disabled={sendingPackageLink || !selectedCustomerId}
                >
                  {sendingPackageLink ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Link
                </Button>
                <Button 
                  onClick={() => handlePackageCheckout(false)}
                  disabled={subscribingPackageId === selectedPackageForMember?.id || !selectedCustomerId}
                >
                  {subscribingPackageId === selectedPackageForMember?.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Stripe Checkout
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <AlertDialog open={deletePlanDialogOpen} onOpenChange={setDeletePlanDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete membership plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{planToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlan}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePackageDialogOpen} onOpenChange={setDeletePackageDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{packageToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePackage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { debugLog } from '@/lib/debugLog';
import { toast } from 'sonner';
import { Plus, Search, Mail, Phone, Edit, Trash2, User, Calendar, Hash, MapPin, CalendarPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';
import { NewBookingDialog } from '@/components/booking/NewBookingDialog';

type Customer = Tables<'customers'>;

export default function CustomersPage() {
  const { logAction } = useAuditLog();
  const auditLogged = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [bookingCustomer, setBookingCustomer] = useState<Customer | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!auditLogged.current) {
      auditLogged.current = true;
      logAction({ action: 'view', resourceType: 'customer', details: { page: 'customers_list' } });
    }
  }, [logAction]);

  // Fetch practitioners, rooms, services for booking dialog
  const { data: practitioners = [] } = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('practitioners').select('*').eq('is_active', true);
      if (error) throw error;
      return data.map(p => ({ 
        ...p, 
        specialties: p.specialties || [],
        availability: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] }
      }));
    },
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('is_active', true);
      if (error) throw error;
      return data.map(r => ({ ...r, amenities: r.amenities || [] }));
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').eq('is_active', true);
      if (error) throw error;
      return (data || []).map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        duration: s.duration,
        price: Number(s.price),
        category: s.category || '',
        practitionerIds: s.practitioner_ids || [],
        is_couples: s.is_couples ?? false,
      }));
    },
  });

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (customer: { first_name: string; last_name: string; email: string; phone?: string | null; notes?: string | null; address?: string | null; tags?: string[] }) => {
      const { data, error } = await supabase
        .from('customers')
        .insert(customer)
        .select()
        .single();
      if (error) throw error;
      debugLog('CustomersPage.tsx:customers.insert', 'Customer created', { customer_id: data.id });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer created successfully');
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast.error('Failed to create customer: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...customer }: Partial<Customer> & { id: string }) => {
      const { data, error } = await supabase
        .from('customers')
        .update(customer)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      debugLog('CustomersPage.tsx:customers.update', 'Customer updated', { customer_id: id });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated successfully');
      setEditingCustomer(null);
    },
    onError: (error) => {
      toast.error('Failed to update customer: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete customer: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>, isEdit: boolean) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const tagsStr = formData.get('tags') as string;
    const customerData = {
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      email: formData.get('email') as string,
      phone: (formData.get('phone') as string) || null,
      notes: (formData.get('notes') as string) || null,
      address: (formData.get('address') as string) || null,
      tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [],
    };

    if (isEdit && editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, ...customerData });
    } else {
      createMutation.mutate(customerData);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">Customers</h1>
            <p className="text-muted-foreground mt-1">Manage your customer database</p>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
              </DialogHeader>
              <CustomerForm onSubmit={(e) => handleSubmit(e, false)} isLoading={createMutation.isPending} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-20 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : customers?.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No customers found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Try a different search term' : 'Add your first customer to get started'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Customer
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customers?.map((customer) => (
              <Card key={customer.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between">
                    <span className="text-lg">
                      {customer.first_name} {customer.last_name}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="New Appointment"
                        onClick={() => setBookingCustomer(customer)}
                      >
                        <CalendarPlus className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingCustomer(customer)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this customer?')) {
                            deleteMutation.mutate(customer.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span className="truncate">{customer.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      <span>{customer.total_appointments || 0} appts</span>
                    </div>
                    {customer.last_appointment && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{format(new Date(customer.last_appointment), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>
                  {customer.tags && customer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {customer.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {customer.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-2 pt-2 border-t">
                      {customer.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingCustomer} onOpenChange={(open) => !open && setEditingCustomer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
            </DialogHeader>
            {editingCustomer && (
              <CustomerForm
                onSubmit={(e) => handleSubmit(e, true)}
                isLoading={updateMutation.isPending}
                defaultValues={editingCustomer}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* New Booking Dialog */}
        {bookingCustomer && (
          <NewBookingDialog
            practitioners={practitioners}
            rooms={rooms}
            services={services}
            existingBookings={[]}
            open={!!bookingCustomer}
            onOpenChange={(open) => !open && setBookingCustomer(null)}
            defaultCustomer={{
              name: `${bookingCustomer.first_name} ${bookingCustomer.last_name}`,
              email: bookingCustomer.email,
              phone: bookingCustomer.phone || undefined
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}

function CustomerForm({
  onSubmit,
  isLoading,
  defaultValues,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  defaultValues?: Customer;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name *</Label>
          <Input
            id="first_name"
            name="first_name"
            required
            defaultValue={defaultValues?.first_name}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input
            id="last_name"
            name="last_name"
            required
            defaultValue={defaultValues?.last_name}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={defaultValues?.email}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultValues?.phone || ''}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          name="address"
          defaultValue={defaultValues?.address || ''}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tags">Tags (comma separated)</Label>
        <Input
          id="tags"
          name="tags"
          placeholder="VIP, Regular, etc."
          defaultValue={defaultValues?.tags?.join(', ') || ''}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaultValues?.notes || ''}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Saving...' : defaultValues ? 'Update Customer' : 'Add Customer'}
      </Button>
    </form>
  );
}

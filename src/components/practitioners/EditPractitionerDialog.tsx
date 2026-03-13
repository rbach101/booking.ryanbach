import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, X, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';

interface ServiceOption {
  id: string;
  name: string;
  category: string | null;
  practitioner_ids: string[] | null;
}

interface EditPractitionerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitioner: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    bio?: string;
    specialties: string[];
    color: string;
    image?: string;
  } | null;
  onSaved?: () => void;
}

export function EditPractitionerDialog({ 
  open, 
  onOpenChange, 
  practitioner,
  onSaved 
}: EditPractitionerDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    specialties: [] as string[],
    color: '#6B8E7B',
    image_url: '',
  });
  const [newSpecialty, setNewSpecialty] = useState('');
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [loadingServices, setLoadingServices] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (practitioner) {
      setFormData({
        name: practitioner.name || '',
        email: practitioner.email || '',
        phone: practitioner.phone || '',
        bio: practitioner.bio || '',
        specialties: practitioner.specialties || [],
        color: practitioner.color || '#6B8E7B',
        image_url: practitioner.image || '',
      });
    }
  }, [practitioner]);

  useEffect(() => {
    if (open && practitioner) {
      fetchServices();
    }
  }, [open, practitioner]);

  const fetchServices = async () => {
    if (!practitioner) return;
    setLoadingServices(true);
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, category, practitioner_ids')
        .eq('is_active', true)
        .order('category')
        .order('name');

      if (error) throw error;

      setServices(data || []);
      
      // Determine which services this practitioner is assigned to
      const assigned = new Set<string>();
      data?.forEach(svc => {
        if (svc.practitioner_ids?.includes(practitioner.id)) {
          assigned.add(svc.id);
        }
      });
      setSelectedServiceIds(assigned);
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoadingServices(false);
    }
  };

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds(prev => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!practitioner) return;
    
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }
    
    if (!formData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    setSaving(true);
    try {
      // Update practitioner info
      const { error } = await supabase
        .from('practitioners')
        .update({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          bio: formData.bio.trim() || null,
          specialties: formData.specialties,
          color: formData.color,
          image_url: formData.image_url.trim() || null,
        })
        .eq('id', practitioner.id);

      if (error) throw error;

      // Update service assignments
      for (const svc of services) {
        const currentlyAssigned = svc.practitioner_ids?.includes(practitioner.id) ?? false;
        const shouldBeAssigned = selectedServiceIds.has(svc.id);

        if (currentlyAssigned === shouldBeAssigned) continue;

        let updatedIds: string[];
        if (shouldBeAssigned) {
          updatedIds = [...(svc.practitioner_ids || []), practitioner.id];
        } else {
          updatedIds = (svc.practitioner_ids || []).filter(id => id !== practitioner.id);
        }

        const { error: svcError } = await supabase
          .from('services')
          .update({ practitioner_ids: updatedIds })
          .eq('id', svc.id);

        if (svcError) {
          console.error(`Error updating service ${svc.name}:`, svcError);
        }
      }

      toast.success('Practitioner updated successfully');
      // Auto-refresh any views that depend on practitioner data
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', { publicOnly: true }] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating practitioner:', error);
      toast.error('Failed to update practitioner');
    } finally {
      setSaving(false);
    }
  };

  const addSpecialty = () => {
    if (newSpecialty.trim() && !formData.specialties.includes(newSpecialty.trim())) {
      setFormData(prev => ({
        ...prev,
        specialties: [...prev.specialties, newSpecialty.trim()],
      }));
      setNewSpecialty('');
    }
  };

  const removeSpecialty = (specialty: string) => {
    setFormData(prev => ({
      ...prev,
      specialties: prev.specialties.filter(s => s !== specialty),
    }));
  };

  // Group services by category
  const servicesByCategory = services.reduce<Record<string, ServiceOption[]>>((acc, svc) => {
    const cat = svc.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(svc);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Edit Practitioner
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="email@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="(808) 555-0123"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="Brief description..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              value={formData.image_url}
              onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                type="color"
                value={formData.color}
                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                className="w-16 h-10 p-1 cursor-pointer"
              />
              <Input
                value={formData.color}
                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                placeholder="#6B8E7B"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Specialties</Label>
            <div className="flex gap-2">
              <Input
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value)}
                placeholder="Add specialty..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSpecialty();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={addSpecialty}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {formData.specialties.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.specialties.map(specialty => (
                  <Badge key={specialty} variant="secondary" className="gap-1">
                    {specialty}
                    <button
                      type="button"
                      onClick={() => removeSpecialty(specialty)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Service Assignments */}
          <div className="space-y-3 pt-2 border-t border-border">
            <Label className="text-base font-semibold">Assigned Services</Label>
            <p className="text-sm text-muted-foreground">
              Select which services this practitioner can perform
            </p>
            {loadingServices ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(servicesByCategory).map(([category, categoryServices]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {category}
                    </p>
                    <div className="space-y-1.5">
                      {categoryServices.map(svc => (
                        <label
                          key={svc.id}
                          className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selectedServiceIds.has(svc.id)}
                            onCheckedChange={() => toggleService(svc.id)}
                          />
                          <span className="text-sm">{svc.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setSelectedServiceIds(new Set(services.map(s => s.id)))}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setSelectedServiceIds(new Set())}
              >
                Deselect all
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="sage" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

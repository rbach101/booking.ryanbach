import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, DollarSign, Clock, Tag, Upload, X, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { debugLog } from '@/lib/debugLog';
import { toast } from 'sonner';
import { sanitizeImageUrl } from '@/lib/safeRedirect';

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number;
  deposit_required: number | null;
  category: string | null;
  is_active: boolean | null;
  is_outcall: boolean | null;
  is_couples: boolean | null;
  is_local: boolean | null;
  image_url: string | null;
  practitioner_ids: string[] | null;
}

interface ExtraRow {
  id: string;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  is_active: boolean | null;
  sort_order: number | null;
}

const CATEGORIES = ['massage', 'kamaaina', 'outcall', 'couples', 'thai', 'specialty', 'insurance', 'yoga'];

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [practitioners, setPractitioners] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Service dialog
  const [editService, setEditService] = useState<ServiceRow | null>(null);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isNewService, setIsNewService] = useState(false);

  // Extra dialog
  const [editExtra, setEditExtra] = useState<ExtraRow | null>(null);
  const [isExtraDialogOpen, setIsExtraDialogOpen] = useState(false);
  const [isNewExtra, setIsNewExtra] = useState(false);
  const [extraImageFile, setExtraImageFile] = useState<File | null>(null);
  const [extraImagePreview, setExtraImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [servicesRes, practitionersRes, extrasRes] = await Promise.all([
        supabase.from('services').select('*').order('category').order('name'),
        supabase.from('practitioners').select('id, name').eq('is_active', true).order('name'),
        supabase.from('booking_extras').select('*').order('sort_order'),
      ]);
      if (servicesRes.error) throw servicesRes.error;
      if (practitionersRes.error) throw practitionersRes.error;
      if (extrasRes.error) throw extrasRes.error;
      setServices(servicesRes.data || []);
      setPractitioners(practitionersRes.data || []);
      setExtras(extrasRes.data || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ─── Service handlers ───
  const openEditService = (svc: ServiceRow) => {
    setEditService({ ...svc });
    setIsNewService(false);
    setIsServiceDialogOpen(true);
  };

  const openNewService = () => {
    setEditService({
      id: '', name: '', description: '', duration: 60, price: 0,
      deposit_required: 0, category: 'massage', is_active: true,
      is_outcall: false, is_couples: false, is_local: false,
      image_url: null, practitioner_ids: [],
    });
    setIsNewService(true);
    setIsServiceDialogOpen(true);
  };

  const handleSaveService = async () => {
    if (!editService) return;
    try {
      const payload = {
        name: editService.name, description: editService.description,
        duration: editService.duration, price: editService.price,
        deposit_required: editService.deposit_required, category: editService.category,
        is_active: editService.is_active, is_outcall: editService.is_outcall,
        is_couples: editService.is_couples, is_local: editService.is_local,
        image_url: editService.image_url, practitioner_ids: editService.practitioner_ids,
      };
      if (isNewService) {
        const { data, error } = await supabase.from('services').insert(payload).select('id').single();
        if (error) throw error;
        debugLog('ServicesPage.tsx:services.insert', 'Service created', { service_id: data?.id });
        toast.success('Service created');
      } else {
        const { error } = await supabase.from('services').update(payload).eq('id', editService.id);
        if (error) throw error;
        debugLog('ServicesPage.tsx:services.update', 'Service updated', { service_id: editService.id });
        toast.success('Service updated');
      }
      setIsServiceDialogOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    }
  };

  const toggleServiceActive = async (svc: ServiceRow) => {
    try {
      const { error } = await supabase.from('services').update({ is_active: !svc.is_active }).eq('id', svc.id);
      if (error) throw error;
      debugLog('ServicesPage.tsx:services.update', 'Service active toggled', { service_id: svc.id, is_active: !svc.is_active });
      setServices(prev => prev.map(s => s.id === svc.id ? { ...s, is_active: !s.is_active } : s));
      toast.success(svc.is_active ? 'Service deactivated' : 'Service activated');
    } catch { toast.error('Failed to update'); }
  };

  // ─── Extra handlers ───
  const openEditExtra = (extra: ExtraRow) => {
    setEditExtra({ ...extra });
    setIsNewExtra(false);
    setExtraImageFile(null);
    setExtraImagePreview(extra.image_url || null);
    setIsExtraDialogOpen(true);
  };

  const openNewExtra = () => {
    setEditExtra({
      id: '', name: '', price: 0, description: '', image_url: null,
      is_active: true, sort_order: extras.length + 1,
    });
    setIsNewExtra(true);
    setExtraImageFile(null);
    setExtraImagePreview(null);
    setIsExtraDialogOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setExtraImageFile(file);
    setExtraImagePreview(URL.createObjectURL(file));
  };

  const uploadExtraImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('extras').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('extras').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSaveExtra = async () => {
    if (!editExtra) return;
    try {
      setUploadingImage(true);
      let imageUrl = editExtra.image_url;

      if (extraImageFile) {
        imageUrl = await uploadExtraImage(extraImageFile);
      }

      const payload = {
        name: editExtra.name,
        price: editExtra.price,
        description: editExtra.description,
        image_url: imageUrl,
        is_active: editExtra.is_active,
        sort_order: editExtra.sort_order,
      };

      if (isNewExtra) {
        const { data, error } = await supabase.from('booking_extras').insert(payload).select('id').single();
        if (error) throw error;
        debugLog('ServicesPage.tsx:booking_extras.insert', 'Extra created', { extra_id: data?.id });
        toast.success('Extra created');
      } else {
        const { error } = await supabase.from('booking_extras').update(payload).eq('id', editExtra.id);
        if (error) throw error;
        debugLog('ServicesPage.tsx:booking_extras.update', 'Extra updated', { extra_id: editExtra.id });
        toast.success('Extra updated');
      }
      setIsExtraDialogOpen(false);
      setExtraImageFile(null);
      setExtraImagePreview(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleExtraActive = async (extra: ExtraRow) => {
    try {
      const { error } = await supabase.from('booking_extras').update({ is_active: !extra.is_active }).eq('id', extra.id);
      if (error) throw error;
      debugLog('ServicesPage.tsx:booking_extras.update', 'Extra active toggled', { extra_id: extra.id, is_active: !extra.is_active });
      setExtras(prev => prev.map(e => e.id === extra.id ? { ...e, is_active: !e.is_active } : e));
      toast.success(extra.is_active ? 'Extra deactivated' : 'Extra activated');
    } catch { toast.error('Failed to update'); }
  };

  const grouped = services.reduce<Record<string, ServiceRow[]>>((acc, s) => {
    const cat = s.category || 'uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">Services & Extras</h1>
          <p className="text-muted-foreground mt-1">Manage your service catalog and booking add-ons</p>
        </div>

        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services">Services ({services.length})</TabsTrigger>
            <TabsTrigger value="extras">Extras / Add-ons ({extras.length})</TabsTrigger>
          </TabsList>

          {/* ─── Services Tab ─── */}
          <TabsContent value="services" className="space-y-6 mt-4">
            <div className="flex justify-end">
              <Button variant="sage" className="gap-2" onClick={openNewService}>
                <Plus className="w-4 h-4" /> Add Service
              </Button>
            </div>
            {Object.entries(grouped).map(([category, svcs]) => (
              <div key={category} className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-foreground capitalize flex items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  {category}
                  <Badge variant="secondary" className="text-xs">{svcs.length}</Badge>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {svcs.map((svc) => (
                    <Card key={svc.id} className={`transition-opacity ${!svc.is_active ? 'opacity-50' : ''}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base font-medium leading-tight">{svc.name}</CardTitle>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditService(svc)} aria-label={`Edit ${svc.name}`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Switch checked={svc.is_active ?? true} onCheckedChange={() => toggleServiceActive(svc)} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        {svc.description && <p className="text-sm text-muted-foreground line-clamp-2">{svc.description}</p>}
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1 text-foreground font-medium">
                            <DollarSign className="w-3.5 h-3.5" />{svc.price}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />{svc.duration} min
                          </span>
                          {svc.deposit_required ? <span className="text-muted-foreground text-xs">Deposit: ${svc.deposit_required}</span> : null}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {svc.is_outcall && <Badge variant="outline" className="text-xs">Outcall</Badge>}
                          {svc.is_couples && <Badge variant="outline" className="text-xs">Couples</Badge>}
                          {svc.is_local && <Badge variant="outline" className="text-xs">Local</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ─── Extras Tab ─── */}
          <TabsContent value="extras" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button variant="sage" className="gap-2" onClick={openNewExtra}>
                <Plus className="w-4 h-4" /> Add Extra
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {extras.map((extra) => (
                <Card key={extra.id} className={`transition-opacity ${!extra.is_active ? 'opacity-50' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-medium">{extra.name}</CardTitle>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditExtra(extra)} aria-label={`Edit ${extra.name}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Switch checked={extra.is_active ?? true} onCheckedChange={() => toggleExtraActive(extra)} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {extra.image_url && (
                      <div className="w-full h-32 rounded-lg overflow-hidden bg-muted">
                        <img src={extra.image_url} alt={extra.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    {extra.description && <p className="text-sm text-muted-foreground">{extra.description}</p>}
                    <span className="flex items-center gap-1 text-foreground font-medium text-sm">
                      <DollarSign className="w-3.5 h-3.5" />{extra.price}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Service Edit Dialog ─── */}
      <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNewService ? 'Add Service' : 'Edit Service'}</DialogTitle>
          </DialogHeader>
          {editService && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={editService.name} onChange={e => setEditService({ ...editService, name: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editService.description || ''} onChange={e => setEditService({ ...editService, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Duration (min)</Label>
                  <Input type="number" value={editService.duration} onChange={e => setEditService({ ...editService, duration: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Price ($)</Label>
                  <Input type="number" step="0.01" value={editService.price} onChange={e => setEditService({ ...editService, price: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Deposit ($)</Label>
                  <Input type="number" step="0.01" value={editService.deposit_required || 0} onChange={e => setEditService({ ...editService, deposit_required: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={editService.category || ''} onValueChange={v => setEditService({ ...editService, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Image URL</Label>
                <Input value={editService.image_url || ''} onChange={e => {
                  const sanitized = sanitizeImageUrl(e.target.value);
                  setEditService({ ...editService, image_url: sanitized });
                  if (e.target.value && !sanitized) {
                    toast.error('Only HTTPS URLs are allowed for images');
                  }
                }} placeholder="https://..." />
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={editService.is_outcall ?? false} onCheckedChange={v => setEditService({ ...editService, is_outcall: v })} /> Outcall
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={editService.is_couples ?? false} onCheckedChange={v => setEditService({ ...editService, is_couples: v })} /> Couples
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={editService.is_local ?? false} onCheckedChange={v => setEditService({ ...editService, is_local: v })} /> Local
                </label>
              </div>
              <div>
                <Label className="mb-2 block">Assigned Practitioners</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {practitioners.map(p => {
                    const selected = editService.practitioner_ids?.includes(p.id) ?? false;
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={selected}
                          onChange={() => {
                            const ids = editService.practitioner_ids || [];
                            setEditService({ ...editService, practitioner_ids: selected ? ids.filter(id => id !== p.id) : [...ids, p.id] });
                          }}
                          className="rounded border-input" />
                        {p.name}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsServiceDialogOpen(false)}>Cancel</Button>
            <Button variant="sage" onClick={handleSaveService}>{isNewService ? 'Create' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Extra Edit Dialog ─── */}
      <Dialog open={isExtraDialogOpen} onOpenChange={(open) => {
        setIsExtraDialogOpen(open);
        if (!open) { setExtraImageFile(null); setExtraImagePreview(null); }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNewExtra ? 'Add Extra' : 'Edit Extra'}</DialogTitle>
          </DialogHeader>
          {editExtra && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={editExtra.name} onChange={e => setEditExtra({ ...editExtra, name: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editExtra.description || ''} onChange={e => setEditExtra({ ...editExtra, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Price ($)</Label>
                  <Input type="number" step="0.01" value={editExtra.price} onChange={e => setEditExtra({ ...editExtra, price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={editExtra.sort_order || 0} onChange={e => setEditExtra({ ...editExtra, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <Label className="mb-2 block">Image</Label>
                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageSelect} className="hidden" />
                {extraImagePreview ? (
                  <div className="relative w-full h-40 rounded-lg overflow-hidden bg-muted border border-border">
                    <img src={extraImagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <Button
                      variant="destructive" size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => {
                        setExtraImageFile(null);
                        setExtraImagePreview(null);
                        setEditExtra({ ...editExtra, image_url: null });
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 rounded-lg border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload image</span>
                    <span className="text-xs text-muted-foreground">Max 5MB</span>
                  </button>
                )}
                {extraImagePreview && !extraImageFile && (
                  <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => fileInputRef.current?.click()}>
                    <ImageIcon className="w-3.5 h-3.5" /> Replace Image
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExtraDialogOpen(false)}>Cancel</Button>
            <Button variant="sage" onClick={handleSaveExtra} disabled={uploadingImage}>
              {uploadingImage ? 'Uploading...' : isNewExtra ? 'Create' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
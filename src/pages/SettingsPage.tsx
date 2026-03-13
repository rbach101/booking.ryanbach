import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarSettings } from '@/components/settings/CalendarSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { BusinessRulesSettings } from '@/components/settings/BusinessRulesSettings';
import { Save, Bell, Calendar, Globe, Shield, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface BusinessSettings {
  id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_time: string | null;
  closing_time: string | null;
  buffer_time: number | null;
  advance_booking_days: number | null;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [formData, setFormData] = useState({
    business_name: '',
    phone: '',
    email: '',
    address: '',
    opening_time: '08:00',
    closing_time: '20:00',
    buffer_time: 15,
    advance_booking_days: 30,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setFormData({
          business_name: data.business_name || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
          opening_time: data.opening_time || '08:00',
          closing_time: data.closing_time || '20:00',
          buffer_time: data.buffer_time || 15,
          advance_booking_days: data.advance_booking_days || 30,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        const { error } = await supabase
          .from('business_settings')
          .update({
            business_name: formData.business_name,
            phone: formData.phone || null,
            email: formData.email || null,
            address: formData.address || null,
            opening_time: formData.opening_time,
            closing_time: formData.closing_time,
            buffer_time: formData.buffer_time,
            advance_booking_days: formData.advance_booking_days,
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('business_settings')
          .insert({
            business_name: formData.business_name,
            phone: formData.phone || null,
            email: formData.email || null,
            address: formData.address || null,
            opening_time: formData.opening_time,
            closing_time: formData.closing_time,
            buffer_time: formData.buffer_time,
            advance_booking_days: formData.advance_booking_days,
          });

        if (error) throw error;
      }

      toast.success('Settings saved successfully');
      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your booking system preferences
          </p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="w-full sm:w-auto inline-flex">
              <TabsTrigger value="general" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
                <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Security
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-1.5 text-xs sm:text-sm sm:gap-2">
                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Rules
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Business Information</CardTitle>
                <CardDescription>
                  Update your studio details and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input 
                      id="businessName" 
                      value={formData.business_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input 
                      id="phone" 
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input 
                    id="address" 
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Business Hours</CardTitle>
                <CardDescription>
                  Set your default operating hours
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opening Time</Label>
                    <Input 
                      type="time" 
                      value={formData.opening_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, opening_time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Closing Time</Label>
                    <Input 
                      type="time" 
                      value={formData.closing_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, closing_time: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <NotificationSettings />
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6">
            <CalendarSettings />

            <Card>
              <CardHeader>
                <CardTitle className="font-display">Booking Settings</CardTitle>
                <CardDescription>
                  Configure booking behavior and restrictions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Buffer Time (minutes)</Label>
                    <Input 
                      type="number" 
                      value={formData.buffer_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, buffer_time: parseInt(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Time between appointments
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Advance Booking (days)</Label>
                    <Input 
                      type="number" 
                      value={formData.advance_booking_days}
                      onChange={(e) => setFormData(prev => ({ ...prev, advance_booking_days: parseInt(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      How far in advance clients can book
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <SecuritySettings />
          </TabsContent>

          <TabsContent value="rules" className="space-y-6">
            <BusinessRulesSettings />
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button variant="sage" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const EVENTS = [
  { value: "Booking Approved", label: "Booking Approved (triggers Confirmed + 24h Reminder)" },
  { value: "Appointment Created", label: "Appointment Created (triggers Booking Received)" },
  { value: "Client Checked In", label: "Client Checked In (triggers Thank You)" },
  { value: "Booking Cancelled", label: "Booking Cancelled (triggers Rebook)" },
];

export default function TestKlaviyoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-klaviyo-sms", {
        body: { name, email, phone },
      });
      if (error) throw error;
      setResult(data);
      toast({
        title: data.success ? "Subscribed!" : "Failed",
        description: data.success ? `Subscribed ${data.phone}` : `Status ${data.subscribeStatus}`,
        variant: data.success ? "default" : "destructive",
      });
    } catch (err: any) {
      setResult({ error: err.message });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerEvent = async () => {
    if (!selectedEvent || !name || !email || !phone) {
      toast({ title: "Missing fields", description: "Fill in name, email, phone and select an event", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-klaviyo-sms", {
        body: { name, email, phone, triggerEvent: selectedEvent },
      });
      if (error) throw error;
      setResult(data);
      toast({
        title: data.success ? "Event Triggered!" : "Failed",
        description: data.success ? `"${selectedEvent}" fired for ${data.phone}` : `Status ${data.eventStatus}`,
        variant: data.success ? "default" : "destructive",
      });
    } catch (err: any) {
      setResult({ error: err.message });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Test Klaviyo SMS</CardTitle>
          <CardDescription>Subscribe to SMS list or trigger a test flow event.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubscribe} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+18081234567" required />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Working..." : "Subscribe to SMS List"}
            </Button>
          </form>

          <div className="border-t my-6" />

          <div className="space-y-3">
            <Label>Trigger Flow Event</Label>
            <Select value={selectedEvent} onValueChange={setSelectedEvent}>
              <SelectTrigger>
                <SelectValue placeholder="Select an event to trigger" />
              </SelectTrigger>
              <SelectContent>
                {EVENTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleTriggerEvent} disabled={loading || !selectedEvent} variant="secondary" className="w-full">
              {loading ? "Triggering..." : "Fire Event →"}
            </Button>
          </div>

          {result && (
            <pre className="mt-4 p-3 rounded-md bg-muted text-xs overflow-auto max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

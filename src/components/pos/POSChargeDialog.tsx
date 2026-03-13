import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CreditCard, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';

// Hawaii General Excise Tax — Hawaii County (Big Island) 4.25%
const HAWAII_GET_RATE = 0.0425;

interface POSChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill client info when opened from a booking */
  defaultClientName?: string;
  defaultClientEmail?: string;
  bookingId?: string;
}

export function POSChargeDialog({
  open,
  onOpenChange,
  defaultClientName = '',
  defaultClientEmail = '',
  bookingId,
}: POSChargeDialogProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState(defaultClientName);
  const [clientEmail, setClientEmail] = useState(defaultClientEmail);
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when defaults change (dialog opened from different context)
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setClientName(defaultClientName);
      setClientEmail(defaultClientEmail);
      setAmount('');
      setDescription('');
    }
    onOpenChange(o);
  };

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    if (!clientEmail.trim()) {
      toast.error('Please enter a client email');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-pos-charge', {
        body: {
          amount: parsedAmount,
          description: description.trim(),
          clientEmail: clientEmail.trim(),
          clientName: clientName.trim() || undefined,
          bookingId: bookingId || undefined,
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error));

      if (data?.url) {
        window.open(data.url, '_blank');
        toast.success('Payment link created and opened!');
        handleOpenChange(false);
      }
    } catch (err) {
      console.error('POS charge error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create payment link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Custom Charge
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pos-client-name">Client Name</Label>
            <Input
              id="pos-client-name"
              placeholder="Jane Doe"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-client-email">Client Email *</Label>
            <Input
              id="pos-client-email"
              type="email"
              placeholder="jane@example.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-amount">Amount (USD) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="pos-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
                required
              />
            </div>
            {(() => {
              const parsed = parseFloat(amount);
              if (!parsed || parsed <= 0) return null;
              const tax = Math.round(parsed * HAWAII_GET_RATE * 100) / 100;
              const total = parsed + tax;
              return (
                <p className="text-sm text-muted-foreground">
                  + Hawaii GET (4.25%): ${tax.toFixed(2)} ={' '}
                  <span className="font-medium text-foreground">${total.toFixed(2)} total</span>
                </p>
              );
            })()}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pos-description">What is this charge for? *</Label>
            <Textarea
              id="pos-description"
              placeholder="e.g. Extra 30 min deep tissue, product purchase..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !amount || !description.trim() || !clientEmail.trim()}
            className="gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {isLoading ? 'Creating...' : 'Create Payment Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

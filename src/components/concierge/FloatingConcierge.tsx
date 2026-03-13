import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AIConciergeChat } from './AIConciergeChat';
import { cn } from '@/lib/utils';

interface FloatingConciergeProps {
  context?: {
    services?: Array<{
      name: string;
      duration: number;
      price: number;
      description: string;
    }>;
    businessInfo?: {
      name: string;
      phone: string;
      email: string;
      address: string;
      openingTime: string;
      closingTime: string;
      cancellationPolicyHours: number;
    };
  };
}

export function FloatingConcierge({ context }: FloatingConciergeProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-20 right-4 z-50 w-[380px] h-[500px] transition-all duration-300 ease-out",
          isOpen 
            ? "opacity-100 translate-y-0 pointer-events-auto" 
            : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <AIConciergeChat context={context} className="h-full" />
      </div>

      {/* Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="lg"
        className={cn(
          "fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg transition-all duration-200",
          isOpen 
            ? "bg-muted text-muted-foreground hover:bg-muted/80" 
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </Button>
    </>
  );
}

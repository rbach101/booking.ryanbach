import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAIConcierge } from '@/hooks/useAIConcierge';

interface AIconciergeChatProps {
  className?: string;
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

const QUICK_QUESTIONS = [
  "What services do you offer?",
  "How do I book an appointment?",
  "What's your cancellation policy?",
  "What should I expect on my first visit?",
];

export function AIConciergeChat({ className, context }: AIconciergeChatProps) {
  const { messages, isLoading, sendMessage, clearMessages } = useAIConcierge();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input.trim();
    setInput('');
    await sendMessage(message, context);
  };

  const handleQuickQuestion = async (question: string) => {
    if (isLoading) return;
    await sendMessage(question, context);
  };

  return (
    <div className={cn("flex flex-col h-full bg-background rounded-xl border border-border shadow-soft overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-sm text-foreground">Alani</h3>
            <p className="text-xs text-muted-foreground">AI Concierge</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearMessages}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-display text-lg font-medium text-foreground mb-2">
                Welcome to Custom Booking
              </h4>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                I'm Alani, your AI concierge. I can help with appointments, services, and any questions you have.
              </p>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">Quick questions:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {QUICK_QUESTIONS.map((question) => (
                  <Button
                    key={question}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickQuestion(question)}
                    disabled={isLoading}
                    className="text-xs"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border bg-muted/20">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} aria-label="Send message">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

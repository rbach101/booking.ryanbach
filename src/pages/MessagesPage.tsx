import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { formatDistanceToNow, format } from 'date-fns';
import { Send, MessageSquare, Search, Phone, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
}

interface SMSMessage {
  id: string;
  customer_id: string | null;
  customer_phone: string;
  customer_name: string;
  direction: string;
  content: string;
  status: string;
  created_at: string;
}

export default function MessagesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email')
      .not('phone', 'is', null)
      .order('last_name');

    if (error) {
      console.error('Error fetching customers:', error);
      return;
    }

    setCustomers(data || []);
    setLoading(false);
  }, []);

  const fetchMessages = useCallback(async (customerId?: string, phone?: string) => {
    let query = supabase
      .from('sms_messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    } else if (phone) {
      query = query.eq('customer_phone', phone);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }
    setMessages(data || []);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchMessages(selectedCustomer.id, selectedCustomer.phone || undefined);
    }
  }, [selectedCustomer, fetchMessages]);

  // Realtime subscription for new SMS messages
  useEffect(() => {
    const channel = supabase
      .channel('sms-messages-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' },
        (payload) => {
          const newMsg = payload.new as SMSMessage;
          if (selectedCustomer && 
              (newMsg.customer_id === selectedCustomer.id || 
               newMsg.customer_phone === selectedCustomer.phone)) {
            setMessages(prev => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedCustomer]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedCustomer?.phone) return;
    setSending(true);
    try {
      const headers = await getEdgeFunctionHeaders();
      const response = await supabase.functions.invoke('send-sms', {
        headers,
        body: {
          to: selectedCustomer.phone,
          message: newMessage.trim(),
          customerName: `${selectedCustomer.first_name} ${selectedCustomer.last_name}`,
          customerId: selectedCustomer.id
        }
      });
      if (response.error) { toast.error(await getFunctionErrorMessage(response.error)); return; }
      toast.success('Message sent');
      setNewMessage('');
    } catch (error) {
      console.error('Send error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
    const phone = c.phone || '';
    return fullName.includes(searchQuery.toLowerCase()) || phone.includes(searchQuery);
  });

  const getInitials = (firstName: string, lastName: string) =>
    `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();

  // Group SMS messages by date
  const groupedMessages: { date: string; messages: SMSMessage[] }[] = [];
  messages.forEach(msg => {
    const dateStr = format(new Date(msg.created_at), 'MMMM d, yyyy');
    const existing = groupedMessages.find(g => g.date === dateStr);
    if (existing) existing.messages.push(msg);
    else groupedMessages.push({ date: dateStr, messages: [msg] });
  });

  return (
    <MainLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">Messages</h1>
            <p className="text-muted-foreground mt-1">SMS communication</p>
          </div>
        </div>

        <div className="flex-1">
          <div className="h-full bg-card rounded-xl shadow-soft border border-border/50 overflow-hidden flex">
            {/* Customer List */}
            <div className="w-80 border-r flex flex-col">
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No customers with phone numbers</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className={cn(
                          "w-full p-4 text-left hover:bg-muted/50 transition-colors flex items-center gap-3",
                          selectedCustomer?.id === customer.id && "bg-accent/30"
                        )}
                      >
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarFallback className="bg-sage text-white text-sm">
                            {getInitials(customer.first_name, customer.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {customer.first_name} {customer.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {customer.phone}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* SMS Message Area */}
            <div className="flex-1 flex flex-col">
              {selectedCustomer ? (
                <>
                  <div className="p-4 border-b bg-muted/30 flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-sage text-white">
                        {getInitials(selectedCustomer.first_name, selectedCustomer.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {selectedCustomer.first_name} {selectedCustomer.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                        <p>No messages yet</p>
                        <p className="text-sm">Send a message to start the conversation</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {groupedMessages.map((group) => (
                          <div key={group.date}>
                            <div className="flex items-center gap-4 mb-4">
                              <div className="h-px flex-1 bg-border" />
                              <span className="text-xs text-muted-foreground">{group.date}</span>
                              <div className="h-px flex-1 bg-border" />
                            </div>
                            <div className="space-y-3">
                              {group.messages.map((msg) => (
                                <div
                                  key={msg.id}
                                  className={cn(
                                    "flex",
                                    msg.direction === 'outbound' ? "justify-end" : "justify-start"
                                  )}
                                >
                                  <div className={cn(
                                    "max-w-[70%] p-3 rounded-lg",
                                    msg.direction === 'outbound'
                                      ? "bg-sage text-white"
                                      : "bg-muted"
                                  )}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    <p className={cn(
                                      "text-xs mt-1",
                                      msg.direction === 'outbound' ? "text-white/70" : "text-muted-foreground"
                                    )}>
                                      {format(new Date(msg.created_at), 'h:mm a')}
                                      {msg.status === 'failed' && (
                                        <span className="ml-2 text-destructive">• Failed</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>

                  <div className="p-4 border-t bg-muted/30">
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        className="resize-none bg-background"
                        rows={2}
                      />
                      <Button 
                        variant="sage" 
                        size="icon"
                        className="h-auto"
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sending}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Select a customer</p>
                  <p className="text-sm">Choose a customer to view or send messages</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

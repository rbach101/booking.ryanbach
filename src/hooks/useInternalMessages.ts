import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { toast } from 'sonner';

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  is_read: boolean;
  booking_id: string | null;
  created_at: string;
  sender?: {
    id: string;
    email: string;
    full_name: string | null;
  };
  recipient?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}

export function useInternalMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const headers = await getEdgeFunctionHeaders();
      const response = await supabase.functions.invoke('internal-messages', {
        headers,
        body: { action: 'list' }
      });

      if (response.error) {
        console.error('Error fetching messages:', response.error);
        return;
      }

      setMessages(response.data?.messages || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendMessage = async (content: string, recipientId?: string | null, bookingId?: string) => {
    try {
      const headers = await getEdgeFunctionHeaders();
      const response = await supabase.functions.invoke('internal-messages', {
        headers,
        body: { 
          action: 'send',
          content,
          recipientId: recipientId || null,
          bookingId
        }
      });

      if (response.error) {
        toast.error('Failed to send message');
        return false;
      }

      toast.success('Message sent');
      await fetchMessages();
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      return false;
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      const headers = await getEdgeFunctionHeaders();
      await supabase.functions.invoke('internal-messages', {
        headers,
        body: { action: 'mark-read', messageId }
      });

      setMessages(prev => 
        prev.map(m => m.id === messageId ? { ...m, is_read: true } : m)
      );
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Subscribe to realtime messages
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_messages'
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMessages]);

  return {
    messages,
    loading,
    sendMessage,
    markAsRead,
    refetch: fetchMessages
  };
}

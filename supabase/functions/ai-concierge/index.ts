import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { getCorsHeaders } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `You are the friendly AI concierge for Custom Booking. You help clients with:

**Check-ins & Appointments:**
- Help clients check in for their appointments
- Provide appointment reminders and details
- Answer questions about upcoming bookings
- Help reschedule or inquire about cancellation policies

**Services & Pricing:**
- Explain our massage services and their benefits
- Provide pricing information
- Recommend services based on client needs
- Explain the difference between massage types (Swedish, Deep Tissue, Hot Stone, etc.)

**Business Information:**
- Share studio location, hours, and contact info
- Explain our cancellation policy (24 hours notice required)
- Describe our facilities and amenities
- Answer questions about parking and accessibility

**Booking Support:**
- Guide clients through the booking process
- Explain deposit requirements
- Help with membership and package inquiries
- Answer questions about gift certificates

**Health & Wellness:**
- Provide general information about massage benefits
- Explain what to expect during a first visit
- Share pre and post-massage care tips
- Answer common questions about contraindications

**Communication Style:**
- Be warm, professional, and welcoming
- Use a calm, spa-like tone
- Keep responses concise but helpful
- If you don't know something specific about the studio, suggest contacting us directly
- For medical advice, always recommend consulting a healthcare provider

**Important Notes:**
- You cannot actually book appointments - direct clients to our online booking page at /book
- For specific availability, suggest checking the online booking system
- For emergencies or urgent matters, recommend calling the studio directly
- Respect client privacy - don't ask for personal health details`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const body = await req.json();
    const { context } = body;
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service is not configured");
    }

    // Build context-aware system prompt
    let enhancedSystemPrompt = SYSTEM_PROMPT;
    
    if (context?.appointment) {
      enhancedSystemPrompt += `\n\n**Current Appointment Context:**
- Client: ${context.appointment.clientName}
- Service: ${context.appointment.service}
- Date: ${context.appointment.date}
- Time: ${context.appointment.time}
- Practitioner: ${context.appointment.practitioner}`;
    }

    if (context?.services) {
      enhancedSystemPrompt += `\n\n**Available Services:**
${context.services.map((s: any) => `- ${s.name}: ${s.duration} min, $${s.price} - ${s.description}`).join('\n')}`;
    }

    if (context?.businessInfo) {
      enhancedSystemPrompt += `\n\n**Business Information:**
- Business Name: ${context.businessInfo.name}
- Phone: ${context.businessInfo.phone}
- Email: ${context.businessInfo.email}
- Address: ${context.businessInfo.address}
- Hours: ${context.businessInfo.openingTime} - ${context.businessInfo.closingTime}
- Cancellation Policy: ${context.businessInfo.cancellationPolicyHours} hours notice required`;
    }

    console.log("Processing AI concierge request with", messages?.length || 0, "messages");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: enhancedSystemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "I'm receiving too many requests right now. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI service temporarily unavailable. Please contact the studio directly." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "Unable to process your request. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Streaming AI response");
    
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI concierge error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "An unexpected error occurred" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

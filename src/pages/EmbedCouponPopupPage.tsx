import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Standalone embeddable coupon popup page.
 * Embed on external sites with:
 * <script>
 *   (function(){
 *     var shown = sessionStorage.getItem('custom-booking_coupon_shown');
 *     if (shown) return;
 *     setTimeout(function() {
 *       sessionStorage.setItem('custom-booking_coupon_shown','1');
 *       var d = document.createElement('div');
 *       d.id = 'custom-booking-coupon-overlay';
 *       d.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;';
 *       d.innerHTML = '<iframe src="https://booking.example.com/embed/coupon-popup" style="width:100%;height:100%;border:none;" allow="clipboard-write"></iframe>';
 *       document.body.appendChild(d);
 *       window.addEventListener('message', function(e) {
 *         if (e.data && e.data.type === 'custom-booking-coupon-close') {
 *           var el = document.getElementById('custom-booking-coupon-overlay');
 *           if (el) el.remove();
 *         }
 *       });
 *     }, 5000);
 *   })();
 * </script>
 */
export default function EmbedCouponPopupPage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Force html/body to be transparent so the overlay renders correctly in an iframe
  useEffect(() => {
    document.documentElement.style.cssText = 'background:transparent!important;height:100%;margin:0;padding:0;';
    document.body.style.cssText = 'background:transparent!important;height:100%;margin:0;padding:0;';
    const root = document.getElementById('root');
    if (root) root.style.cssText = 'height:100%;';
    return () => {
      document.documentElement.style.cssText = '';
      document.body.style.cssText = '';
      if (root) root.style.cssText = '';
    };
  }, []);

  const handleClose = () => {
    // Tell parent window to remove the overlay
    window.parent.postMessage({ type: 'custom-booking-coupon-close' }, '*');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !phone.trim()) {
      setError('Please enter both email and phone number.');
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    // Basic phone validation
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await supabase.functions.invoke('coupon-signup', {
        body: { email: email.trim(), phone: phone.trim() },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Listen for Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          maxWidth: '440px',
          width: '100%',
          padding: '32px',
          position: 'relative',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#9ca3af',
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ×
        </button>

        {submitted ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌺</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
              Mahalo!
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '15px' }}>
              Check your text messages for your coupon code <strong>NEWMEMBER</strong>.
            </p>
            <div
              style={{
                background: '#6b8f71',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '24px',
                fontWeight: 700,
                letterSpacing: '3px',
                display: 'inline-block',
                marginBottom: '16px',
              }}
            >
              NEWMEMBER
            </div>
            <p style={{ color: '#9ca3af', fontSize: '13px' }}>
              Add the Amethyst Biomat to your booking extras and enter this code at checkout.
            </p>
            <button
              onClick={handleClose}
              style={{
                marginTop: '20px',
                background: '#6b8f71',
                color: '#fff',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>✨</div>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>
                Free Amethyst Biomat!
              </h2>
              <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
                Sign up and get a <strong>free Biomat add-on</strong> ($15 value) with your first massage booking.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {error && (
                <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '8px' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: isSubmitting ? '#9ca3af' : '#6b8f71',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'Sending...' : 'Get My Free Biomat! 🌿'}
              </button>

              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '11px', marginTop: '12px' }}>
                By signing up you agree to receive SMS messages. Msg & data rates may apply. Reply STOP to unsubscribe.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

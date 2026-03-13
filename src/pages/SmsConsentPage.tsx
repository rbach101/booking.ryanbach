import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SmsConsentPage() {
  return (
    <>
      <Helmet>
        <title>SMS Consent | Custom Booking Massage Studio</title>
        <meta name="description" content="Opt in to receive SMS appointment reminders and notifications from Custom Booking Massage Studio." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <Button variant="ghost" asChild className="mb-8">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>

          <div className="flex items-center gap-3 mb-8">
            <MessageSquare className="w-8 h-8 text-primary" />
            <h1 className="font-display text-4xl font-semibold text-foreground">
              SMS Notifications
            </h1>
          </div>

          <div className="prose prose-sage max-w-none space-y-6 text-muted-foreground">
            <p className="text-lg">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">SMS Consent &amp; Terms</h2>
              <p>
                By opting in to SMS notifications from Custom Booking Massage Studio, you agree to receive 
                text messages related to your appointments, including but not limited to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Appointment confirmations</li>
                <li>Appointment reminders (typically 24 hours and 1 hour before your session)</li>
                <li>Booking status updates (approvals, cancellations, rescheduling)</li>
                <li>Waitlist notifications when a spot becomes available</li>
                <li>Balance and payment reminders</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">How to Opt In</h2>
              <p>
                You can opt in to SMS notifications during the booking process by checking the 
                "I agree to receive SMS notifications" checkbox. You may also provide consent 
                verbally or in writing to our staff.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">Message Frequency</h2>
              <p>
                Message frequency varies based on your appointment schedule. You will typically 
                receive 2–4 messages per appointment (confirmation, reminders, and follow-up). 
                We do not send marketing or promotional messages via SMS.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">Message &amp; Data Rates</h2>
              <p>
                Standard message and data rates may apply depending on your mobile carrier and plan. 
                Custom Booking Massage Studio is not responsible for any charges from your wireless provider.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">How to Opt Out</h2>
              <p>
                You can opt out of SMS notifications at any time by:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Replying <strong>STOP</strong> to any message from us</li>
                <li>Contacting us at <a href="mailto:support@example.com" className="text-primary hover:underline">support@example.com</a></li>
                <li>Informing our staff during your next visit</li>
              </ul>
              <p>
                After opting out, you will receive one final confirmation message. You will no longer 
                receive SMS notifications unless you opt in again.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">Help</h2>
              <p>
                If you need assistance, reply <strong>HELP</strong> to any message or contact us at:
              </p>
              <p className="font-medium text-foreground">
                Custom Booking Massage Studio<br />
                Email: <a href="mailto:support@example.com" className="text-primary hover:underline">support@example.com</a>
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">Privacy</h2>
              <p>
                Your phone number and messaging preferences are kept confidential and are never 
                sold or shared with third parties. For full details, see our{' '}
                <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </p>
            </section>

            <div className="pt-8 border-t border-border space-y-2">
              <Link to="/privacy" className="text-primary hover:underline block">
                View our Privacy Policy
              </Link>
              <Link to="/privacy/terms" className="text-primary hover:underline block">
                View our Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

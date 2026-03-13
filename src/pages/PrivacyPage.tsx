import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy | Custom Booking Massage Studio</title>
        <meta name="description" content="Privacy Policy for Custom Booking Massage Studio" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <Button variant="ghost" asChild className="mb-8">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>

          <h1 className="font-display text-4xl font-semibold text-foreground mb-8">
            Privacy Policy
          </h1>

          <div className="prose prose-sage max-w-none space-y-6 text-muted-foreground">
            <p className="text-lg">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">1. Introduction</h2>
              <p>
                Custom Booking Massage Studio ("we," "our," or "us") is committed to protecting your privacy. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information 
                when you use our booking platform and services.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>
              <p>We collect information that you provide directly to us, including:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Name, email address, and phone number when booking appointments</li>
                <li>Booking preferences and appointment history</li>
                <li>Any notes or special requests you provide</li>
                <li>Account credentials if you create an account</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">3. Google Calendar Integration</h2>
              <p>
                Our application integrates with Google Calendar to sync appointments. When you connect 
                your Google Calendar, we access:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Calendar events to check availability and create bookings</li>
                <li>Basic profile information associated with your Google account</li>
              </ul>
              <p>
                We only access the minimum information necessary to provide our booking services. 
                We do not access, store, or share any other data from your Google account.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">4. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Process and manage your bookings</li>
                <li>Send appointment confirmations and reminders</li>
                <li>Communicate with you about our services</li>
                <li>Improve our services and user experience</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">5. Data Sharing</h2>
              <p>
                We do not sell, trade, or rent your personal information to third parties. 
                We may share your information only in the following circumstances:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>With service providers who assist in operating our platform</li>
                <li>When required by law or to protect our rights</li>
                <li>With your consent</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">6. Data Security</h2>
              <p>
                We implement appropriate technical and organizational measures to protect your 
                personal information against unauthorized access, alteration, disclosure, or destruction.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">7. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your information</li>
                <li>Disconnect your Google Calendar at any time</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">8. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at:
              </p>
              <p className="font-medium text-foreground">
                Custom Booking Massage Studio<br />
                Email: support@example.com
              </p>
            </section>

            <div className="pt-8 border-t border-border">
              <Link to="/privacy/terms" className="text-primary hover:underline">
                View our Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
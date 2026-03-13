import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermsPage() {
  return (
    <>
      <Helmet>
        <title>Terms of Service | Custom Booking Massage Studio</title>
        <meta name="description" content="Terms of Service for Custom Booking Massage Studio" />
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
            Terms of Service
          </h1>

          <div className="prose prose-sage max-w-none space-y-6 text-muted-foreground">
            <p className="text-lg">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">1. Agreement to Terms</h2>
              <p>
                By accessing or using the Custom Booking Massage Studio booking platform, you agree to be 
                bound by these Terms of Service. If you do not agree to these terms, please do not 
                use our services.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">2. Use of Services</h2>
              <p>
                Our platform allows you to book massage and wellness appointments. You agree to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide accurate and complete information when booking</li>
                <li>Arrive on time for scheduled appointments</li>
                <li>Notify us of cancellations at least 24 hours in advance</li>
                <li>Use our services only for lawful purposes</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">3. Booking and Payments</h2>
              <p>
                When you book an appointment through our platform:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>A deposit may be required to confirm your booking</li>
                <li>The remaining balance is due at the time of your appointment</li>
                <li>Cancellations made less than 24 hours before the appointment may forfeit the deposit</li>
                <li>No-shows may be charged the full service amount</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">4. Google Calendar Integration</h2>
              <p>
                If you choose to connect your Google Calendar:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>You authorize us to access your calendar for scheduling purposes</li>
                <li>We will create, modify, or delete events related to your bookings</li>
                <li>You can disconnect your calendar at any time through account settings</li>
                <li>Disconnecting will not affect existing bookings but will stop calendar sync</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">5. User Accounts</h2>
              <p>
                If you create an account:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>You are responsible for maintaining the security of your account</li>
                <li>You must notify us immediately of any unauthorized access</li>
                <li>We reserve the right to suspend accounts that violate these terms</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">6. Health and Safety</h2>
              <p>
                For your safety and the safety of our practitioners:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Please inform us of any medical conditions or allergies</li>
                <li>Massage services are not a substitute for medical treatment</li>
                <li>We reserve the right to refuse service if we believe it may be harmful</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">7. Intellectual Property</h2>
              <p>
                All content on our platform, including text, graphics, logos, and software, 
                is the property of Custom Booking Massage Studio and is protected by copyright laws.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">8. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Custom Booking Massage Studio shall not be 
                liable for any indirect, incidental, special, or consequential damages arising 
                from your use of our services.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">9. Changes to Terms</h2>
              <p>
                We reserve the right to modify these terms at any time. We will notify users 
                of significant changes. Your continued use of our services after changes 
                constitutes acceptance of the modified terms.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">10. Contact Us</h2>
              <p>
                If you have any questions about these Terms of Service, please contact us at:
              </p>
              <p className="font-medium text-foreground">
                Custom Booking Massage Studio<br />
                Email: support@example.com
              </p>
            </section>

            <div className="pt-8 border-t border-border">
              <Link to="/privacy" className="text-primary hover:underline">
                View our Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
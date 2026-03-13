import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Leaf, Calendar, Users, Clock, CreditCard, FileText, Bell, Sparkles, Shield, Code } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const LandingPage = () => {
  const [demoForm, setDemoForm] = useState({ name: '', email: '', businessName: '' });
  const [demoStatus, setDemoStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [demoError, setDemoError] = useState('');

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDemoError('');
    setDemoStatus('loading');
    try {
      const { data, error } = await supabase.functions.invoke('demo-signup', {
        body: {
          name: demoForm.name.trim(),
          email: demoForm.email.trim(),
          business_name: demoForm.businessName.trim() || undefined,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDemoStatus('success');
      setDemoForm({ name: '', email: '', businessName: '' });
    } catch (err: unknown) {
      setDemoStatus('error');
      setDemoError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <>
      <Helmet>
        <title>Custom Booking — Booking Platform for Wellness Businesses</title>
        <meta name="description" content="Custom Booking: booking software that adapts to your business. No data selling, no preset boundaries. Built for wellness — customized at the code level." />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <Leaf className="h-8 w-8 text-sage" />
              <span className="text-xl font-semibold text-foreground">Custom Booking</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/auth">
                <Button variant="ghost" size="sm">Staff Login</Button>
              </Link>
              <a href="#request-demo">
                <Button size="sm" className="bg-sage hover:bg-sage/90">Request Demo</Button>
              </a>
            </div>
          </div>
        </header>

        {/* Hero + Demo Signup */}
        <section className="relative py-16 lg:py-24 bg-gradient-to-br from-sage/10 via-background to-sand/20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-16">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
                  Not Another One-Size-Fits-All Booking App
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                  The big booking platforms are designed for everyone — which means they work for no one. Universal templates, rigid boundaries, and your data sold to the highest bidder. Custom Booking is built differently: we adapt to your business, not the other way around.
                </p>
              </div>

              {/* Demo Request Form - Prominent */}
              <div id="request-demo" className="bg-card rounded-2xl p-6 md:p-8 shadow-lg border border-border/50">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-6 h-6 text-sage" />
                  <h2 className="text-2xl font-bold text-foreground">Request a Demo</h2>
                </div>
                <p className="text-muted-foreground mb-6">
                  Try the platform for yourself. We&apos;ll set you up with access and walk you through how it works for your business.
                </p>
                {demoStatus === 'success' ? (
                  <div className="bg-sage/10 border border-sage/30 rounded-xl p-6 text-center">
                    <p className="font-medium text-sage">Thanks for signing up!</p>
                    <p className="text-sm text-muted-foreground mt-1">We&apos;ll be in touch soon to set up your demo.</p>
                  </div>
                ) : (
                  <form onSubmit={handleDemoSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="demo-name">Name</Label>
                      <Input
                        id="demo-name"
                        type="text"
                        placeholder="Your name"
                        value={demoForm.name}
                        onChange={(e) => setDemoForm(f => ({ ...f, name: e.target.value }))}
                        required
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="demo-email">Email</Label>
                      <Input
                        id="demo-email"
                        type="email"
                        placeholder="you@yourbusiness.com"
                        value={demoForm.email}
                        onChange={(e) => setDemoForm(f => ({ ...f, email: e.target.value }))}
                        required
                        className="mt-1.5"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="demo-business">Business name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input
                        id="demo-business"
                        type="text"
                        placeholder="Your spa or studio"
                        value={demoForm.businessName}
                        onChange={(e) => setDemoForm(f => ({ ...f, businessName: e.target.value }))}
                        className="mt-1.5"
                      />
                    </div>
                    {demoError && (
                      <p className="text-sm text-destructive md:col-span-2">{demoError}</p>
                    )}
                    <div className="md:col-span-2">
                      <Button
                        type="submit"
                        className="w-full md:w-auto bg-sage hover:bg-sage/90 px-8"
                        disabled={demoStatus === 'loading'}
                      >
                        {demoStatus === 'loading' ? 'Requesting...' : 'Request Demo Access'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* The Problem with Big Booking Software */}
        <section className="py-16 lg:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto mb-12">
              <img
                src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=800"
                alt="Corporate office building"
                className="w-full h-48 object-cover rounded-xl mb-8"
              />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4">
              Why the Big Names Don&apos;t Fit
            </h2>
            <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
              Most booking software is built as a universal platform — one product for millions of businesses. You get a dashboard, a few toggles, and that&apos;s it. No code-level control. No adapting to your specific workflows. Just their boundaries.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-background rounded-xl p-5 border border-border/50">
                <p className="text-sm font-medium text-muted-foreground mb-1">They Sell Your Data</p>
                <p className="text-foreground">Big companies sell your information to other businesses. Your client list, booking patterns, and business insights become their product. We never sell your data — period.</p>
              </div>
              <div className="bg-background rounded-xl p-5 border border-border/50">
                <p className="text-sm font-medium text-muted-foreground mb-1">Limited Customization</p>
                <p className="text-foreground">You can change colors and logos. You cannot change how it works. Everything stays within their preset boundaries.</p>
              </div>
              <div className="bg-background rounded-xl p-5 border border-border/50">
                <p className="text-sm font-medium text-muted-foreground mb-1">One Platform for All</p>
                <p className="text-foreground">Designed for everyone means optimized for no one. Your wellness business gets the same generic flow as a nail salon or a gym.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Competitor Comparison */}
        <section id="compare" className="py-16 lg:py-24 bg-background">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4">
              Compare the Big Names
            </h2>
            <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
              These platforms dominate the market. Here&apos;s what you&apos;re really signing up for.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              <a
                href="https://www.mindbodyonline.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-card rounded-xl p-6 border border-border/50 hover:border-muted-foreground/30 transition-colors group"
              >
                <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center mb-4 overflow-hidden">
                  <img src="https://www.google.com/s2/favicons?domain=mindbodyonline.com&sz=64" alt="" className="w-8 h-8 object-contain" />
                </div>
                <h3 className="font-semibold text-foreground mb-2 group-hover:text-sage">Mindbody</h3>
                <p className="text-sm text-muted-foreground mb-3">Industry giant. $450+/mo for full features. 12-month contracts.</p>
                <p className="text-xs text-muted-foreground">Sells your data to third parties. Universal platform. One template, their boundaries.</p>
              </a>
              <a
                href="https://www.momence.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-card rounded-xl p-6 border border-border/50 hover:border-muted-foreground/30 transition-colors group"
              >
                <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center mb-4 overflow-hidden">
                  <img src="https://www.google.com/s2/favicons?domain=momence.com&sz=64" alt="" className="w-8 h-8 object-contain" />
                </div>
                <h3 className="font-semibold text-foreground mb-2 group-hover:text-sage">Momence</h3>
                <p className="text-sm text-muted-foreground mb-3">~$199/mo. Class-focused. Add-on fees for core features.</p>
                <p className="text-xs text-muted-foreground">Universal platform. Limited to their preset workflows. Data shared with partners.</p>
              </a>
              <a
                href="https://www.fresha.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-card rounded-xl p-6 border border-border/50 hover:border-muted-foreground/30 transition-colors group"
              >
                <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center mb-4 overflow-hidden">
                  <img src="https://www.google.com/s2/favicons?domain=fresha.com&sz=64" alt="" className="w-8 h-8 object-contain" />
                </div>
                <h3 className="font-semibold text-foreground mb-2 group-hover:text-sage">Fresha</h3>
                <p className="text-sm text-muted-foreground mb-3">Free to start. 140K+ businesses. Takes % of revenue.</p>
                <p className="text-xs text-muted-foreground">Your transactions = their revenue. Sells data. One template for everyone.</p>
              </a>
              <a
                href="https://www.acuityscheduling.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-card rounded-xl p-6 border border-border/50 hover:border-muted-foreground/30 transition-colors group"
              >
                <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center mb-4 overflow-hidden">
                  <img src="https://www.google.com/s2/favicons?domain=acuityscheduling.com&sz=64" alt="" className="w-8 h-8 object-contain" />
                </div>
                <h3 className="font-semibold text-foreground mb-2 group-hover:text-sage">Acuity</h3>
                <p className="text-sm text-muted-foreground mb-3">~$16/mo. Simple scheduling. Squarespace-owned.</p>
                <p className="text-xs text-muted-foreground">Basic features only. No code-level control. Stays within their walls.</p>
              </a>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-16 lg:py-24 bg-sage/10">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4">
              Investment That Fits Your Business
            </h2>
            <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
              Custom Booking costs more because it&apos;s actually customized. We build for you — not a template you adapt to. One-time setup. Ongoing support included.
            </p>
            <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-6 justify-center items-center">
              <div className="bg-card rounded-2xl p-8 border-2 border-sage/50 shadow-lg text-center w-full sm:w-auto">
                <p className="text-sm font-medium text-muted-foreground mb-1">Custom Build</p>
                <p className="text-4xl font-bold text-foreground">$2,000</p>
                <p className="text-sm text-muted-foreground mt-2">Platform built to your workflows, branding, and needs</p>
              </div>
              <div className="bg-card rounded-2xl p-8 border-2 border-sage/50 shadow-lg text-center w-full sm:w-auto">
                <p className="text-sm font-medium text-muted-foreground mb-1">Monthly</p>
                <p className="text-4xl font-bold text-foreground">$99<span className="text-lg font-normal text-muted-foreground">/mo</span></p>
                <p className="text-sm text-muted-foreground mt-2">Hosting, updates, and support included</p>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-6 max-w-xl mx-auto">
              No data selling. No long contracts. Your platform, your data, your rules.
            </p>
            <div className="text-center mt-8">
              <a href="#request-demo">
                <Button size="lg" className="bg-sage hover:bg-sage/90">
                  Request a Demo
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 lg:py-24 bg-background">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4">
              Built for You, Not for Everyone
            </h2>
            <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
              We build on a code level. Your platform adapts to your workflows, your branding, and your specific needs — not the other way around.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <Calendar className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Online Booking 24/7</h3>
                <p className="text-muted-foreground">
                  Clients book and pay deposits without calling. You approve when ready. Reduce no-shows with automated reminders.
                </p>
              </div>
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Calendar Sync</h3>
                <p className="text-muted-foreground">
                  Connect Google Calendar to avoid double-booking. See availability across practitioners and rooms in one place.
                </p>
              </div>
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <CreditCard className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Payments & Deposits</h3>
                <p className="text-muted-foreground">
                  Collect deposits, tips, and balances online. Stripe integration included. Memberships and session packages for recurring revenue.
                </p>
              </div>
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Intake Forms & SOAP Notes</h3>
                <p className="text-muted-foreground">
                  HIPAA-ready documentation for health waivers and treatment notes. Clients complete forms before appointments.
                </p>
              </div>
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <Bell className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Automated Reminders</h3>
                <p className="text-muted-foreground">
                  Email and SMS reminders reduce no-shows. Internal messaging for your team. Notifications for new bookings and changes.
                </p>
              </div>
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <Code className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Code-Level Control</h3>
                <p className="text-muted-foreground">
                  Not just toggles and themes. We build and adapt at the code level so your platform fits your business — not a generic template with boundaries you can&apos;t cross.
                </p>
              </div>
            </div>
            <div className="text-center mt-10">
              <a href="#request-demo">
                <Button className="bg-sage hover:bg-sage/90">
                  Request a Demo
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section className="py-16 lg:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4">
              The Custom Booking Difference
            </h2>
            <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
              We don&apos;t sell your data. We don&apos;t lock you into preset boundaries. We build software that adapts to your specific needs.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Your Data Stays Yours</h3>
                <p className="text-sm text-muted-foreground">We don&apos;t monetize your client list or sell your business data. Period.</p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Code className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Built to Adapt</h3>
                <p className="text-sm text-muted-foreground">Code-level customization. Your workflows, your rules — not a universal platform with boundaries.</p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Leaf className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Built for Wellness</h3>
                <p className="text-sm text-muted-foreground">Designed for spas, massage studios, yoga studios, and therapy practices — not a one-size-fits-all template.</p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Tailored to You</h3>
                <p className="text-sm text-muted-foreground">Every feature configured for how you work. No fighting the system.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 lg:py-24 bg-sage/10">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready for Something Different?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              See what a booking platform built for your business — not for everyone — looks like. Request a demo. No commitment.
            </p>
            <a href="#request-demo">
              <Button size="lg" className="bg-sage hover:bg-sage/90 text-white px-10">
                Request Demo Access
              </Button>
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-muted/50 border-t border-border/50 py-12">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Leaf className="h-6 w-6 text-sage" />
                  <span className="text-lg font-semibold text-foreground">Custom Booking</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Booking software that adapts to you. No data selling. No preset boundaries. Built for wellness businesses, customized at the code level.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-4">Quick Links</h4>
                <ul className="space-y-2 text-sm">
                  <li><a href="#request-demo" className="text-muted-foreground hover:text-sage transition-colors">Request Demo</a></li>
                  <li><a href="#features" className="text-muted-foreground hover:text-sage transition-colors">Features</a></li>
                  <li><a href="#compare" className="text-muted-foreground hover:text-sage transition-colors">Compare</a></li>
                  <li><Link to="/auth" className="text-muted-foreground hover:text-sage transition-colors">Staff Portal</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-4">Contact</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <a href="mailto:booking@support.thedigitaldocs.com" className="hover:text-sage transition-colors">booking@support.thedigitaldocs.com</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="border-t border-border/50 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Custom Booking. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-sm">
                <Link to="/privacy" className="text-muted-foreground hover:text-sage transition-colors">
                  Privacy Policy
                </Link>
                <Link to="/privacy/terms" className="text-muted-foreground hover:text-sage transition-colors">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default LandingPage;

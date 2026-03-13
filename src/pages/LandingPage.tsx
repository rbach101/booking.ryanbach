import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Leaf, Calendar, Users, Clock, MapPin, Phone, Mail } from 'lucide-react';

const LandingPage = () => {
  return (
    <>
      <Helmet>
        <title>Custom Booking Massage & Yoga | Wellness Services in Paradise</title>
        <meta name="description" content="Experience rejuvenating massage therapy and yoga sessions at Custom Booking. Book your wellness appointment today for relaxation and healing." />
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
              <Link to="/book">
                <Button size="sm" className="bg-sage hover:bg-sage/90">Book Now</Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 bg-gradient-to-br from-sage/10 via-background to-sand/20">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
              Restore Your Body & Mind
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Custom Booking offers professional massage therapy and yoga services designed to help you 
              relax, heal, and find balance. Experience personalized wellness in a serene environment.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/book">
                <Button size="lg" className="bg-sage hover:bg-sage/90 text-white px-8">
                  <Calendar className="mr-2 h-5 w-5" />
                  Book an Appointment
                </Button>
              </Link>
              <a href="#services">
                <Button size="lg" variant="outline" className="px-8">
                  Explore Services
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="py-16 lg:py-24 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Welcome to Custom Booking
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                At Custom Booking, we believe in the healing power of touch and movement. Our experienced 
                practitioners combine traditional techniques with modern wellness practices to create 
                personalized experiences that address your unique needs. Whether you're seeking relief 
                from tension, recovery from injury, or simply a peaceful escape, we're here to guide 
                your journey to wellness.
              </p>
            </div>
          </div>
        </section>

        {/* Services Section */}
        <section id="services" className="py-16 lg:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">
              Our Services
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <Leaf className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Massage Therapy</h3>
                <p className="text-muted-foreground">
                  From relaxing Swedish massages to therapeutic deep tissue work, our skilled therapists 
                  customize each session to your needs.
                </p>
              </div>
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Yoga Sessions</h3>
                <p className="text-muted-foreground">
                  Private and group yoga classes for all levels. Improve flexibility, strength, and 
                  mindfulness with expert guidance.
                </p>
              </div>
              <div className="bg-card rounded-xl p-6 shadow-sm border border-border/50">
                <div className="w-12 h-12 bg-sage/10 rounded-lg flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-sage" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Couples Treatments</h3>
                <p className="text-muted-foreground">
                  Share a relaxing experience with a loved one. Our couples massages create a peaceful 
                  bonding experience together.
                </p>
              </div>
            </div>
            <div className="text-center mt-10">
              <Link to="/book">
                <Button className="bg-sage hover:bg-sage/90">
                  View All Services & Book
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section className="py-16 lg:py-24 bg-background">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">
              Why Choose Custom Booking
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Expert Practitioners</h3>
                <p className="text-sm text-muted-foreground">Licensed and experienced therapists dedicated to your wellness</p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Easy Booking</h3>
                <p className="text-sm text-muted-foreground">Book online 24/7 at your convenience</p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Serene Location</h3>
                <p className="text-sm text-muted-foreground">A peaceful retreat designed for relaxation</p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Leaf className="h-8 w-8 text-sage" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Personalized Care</h3>
                <p className="text-sm text-muted-foreground">Treatments tailored to your individual needs</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 lg:py-24 bg-sage/10">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to Begin Your Wellness Journey?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Book your appointment today and discover the difference that professional care can make.
            </p>
            <Link to="/book">
              <Button size="lg" className="bg-sage hover:bg-sage/90 text-white px-10">
                Book Your Session
              </Button>
            </Link>
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
                  Professional massage therapy and yoga services for your wellness journey.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-4">Quick Links</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link to="/book" className="text-muted-foreground hover:text-sage transition-colors">Book Online</Link></li>
                  <li><a href="#services" className="text-muted-foreground hover:text-sage transition-colors">Our Services</a></li>
                  <li><Link to="/auth" className="text-muted-foreground hover:text-sage transition-colors">Staff Portal</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-4">Contact</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <a href="tel:+18083589553" className="hover:text-sage transition-colors">(808) 358-9553</a>
                  </li>
                  <li className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <a href="mailto:support@example.com" className="hover:text-sage transition-colors">support@example.com</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="border-t border-border/50 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Custom Booking Massage & Yoga. All rights reserved.
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

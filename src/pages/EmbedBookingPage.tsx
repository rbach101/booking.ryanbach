import { useState, useMemo, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { serviceCategories, FullService } from '@/data/fullServiceData';
import { ServiceCard } from '@/components/booking/ServiceCard';
import { usePublicServices } from '@/hooks/usePublicServices';
import { BookingWizard, BookingDetails } from '@/components/booking/BookingWizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, SlidersHorizontal, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Post height to parent so iframe can auto-resize
function usePostHeight() {
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      root.style.padding = '0';
      root.style.textAlign = 'left';
      root.style.maxWidth = '100%';
    }
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';

    const sendHeight = () => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: 'custom-booking-embed-height', height }, '*');
    };

    // Send height on resize
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);

    // Send height after each image loads (images change layout height)
    const onImageLoad = () => sendHeight();
    document.addEventListener('load', onImageLoad, true); // capture phase catches img loads

    // Also send height periodically for the first 10 seconds to catch late renders
    const intervals = [100, 300, 500, 1000, 2000, 3000, 5000, 8000, 10000];
    const timers = intervals.map(ms => setTimeout(sendHeight, ms));

    sendHeight();

    return () => {
      observer.disconnect();
      document.removeEventListener('load', onImageLoad, true);
      timers.forEach(clearTimeout);
      if (root) {
        root.style.padding = '';
        root.style.textAlign = '';
        root.style.maxWidth = '';
      }
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);
}

type SortOption = 'default' | 'price-low' | 'price-high';

export default function EmbedBookingPage() {
  usePostHeight();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [selectedService, setSelectedService] = useState<FullService | null>(null);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<BookingDetails | null>(null);
  const { toast } = useToast();
  const { data: publicServicesData, isLoading: servicesLoading } = usePublicServices();
  const serviceGroups = publicServicesData?.serviceGroups ?? [];
  const fullServices = publicServicesData?.fullServices ?? [];

  const filteredServiceGroups = useMemo(() => {
    let groups = [...serviceGroups];

    if (selectedCategory !== 'all') {
      groups = groups.filter(g => g.category === selectedCategory);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      groups = groups.filter(g =>
        g.name.toLowerCase().includes(query) ||
        g.baseDescription.toLowerCase().includes(query)
      );
    }
    switch (sortBy) {
      case 'price-low':
        groups.sort((a, b) => a.durations[0].price - b.durations[0].price);
        break;
      case 'price-high':
        groups.sort((a, b) => {
          const aMax = Math.max(...a.durations.map(d => d.price));
          const bMax = Math.max(...b.durations.map(d => d.price));
          return bMax - aMax;
        });
        break;
    }
    return groups;
  }, [selectedCategory, searchQuery, sortBy, serviceGroups]);

  const handleBookingComplete = (booking: BookingDetails) => {
    setCompletedBooking(booking);
    setBookingComplete(true);
    toast({
      title: "Booking Request Submitted!",
      description: "You will receive a confirmation email shortly.",
    });
  };

  const handleStartOver = () => {
    setSelectedService(null);
    setBookingComplete(false);
    setCompletedBooking(null);
  };

  // Booking Confirmation
  if (bookingComplete && completedBooking) {
    return (
      <div className="bg-background p-4">
        <Helmet><title>Booking Confirmed - Custom Booking</title></Helmet>
        <div className="max-w-2xl mx-auto">
          <div className="bg-card rounded-2xl shadow-medium p-8 text-center">
            <div className="w-16 h-16 bg-sage/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-sage" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground mb-4">Booking Request Received!</h1>
            <p className="text-muted-foreground mb-8">
              You will receive a confirmation email at{' '}
              <span className="font-medium text-foreground">{completedBooking.clientEmail}</span> shortly.
            </p>
            <div className="bg-muted/50 rounded-lg p-6 text-left mb-8">
              <h2 className="font-semibold mb-4">Booking Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service</span>
                  <span className="font-medium">{completedBooking.service.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {completedBooking.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">{completedBooking.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Practitioner</span>
                  <span className="font-medium">{completedBooking.practitioner?.name || 'Any Available'}</span>
                </div>
              </div>
            </div>
            <Button onClick={handleStartOver} className="bg-sage hover:bg-sage-dark text-white">
              Book Another Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Booking Wizard
  if (selectedService) {
    return (
      <div className="bg-background p-4">
        <Helmet><title>Book {selectedService.name} - Custom Booking</title></Helmet>
        <div className="max-w-4xl mx-auto">
          <BookingWizard
            service={selectedService}
            onBack={() => setSelectedService(null)}
            onComplete={handleBookingComplete}
          />
        </div>
      </div>
    );
  }

  // Service Catalog (no hero, no footer, compact)
  return (
    <div className="bg-background">
      <Helmet>
        <title>Book Online - Custom Booking</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Compact Header */}
      <div className="p-4 pb-0">
        <h1 className="text-2xl font-display font-bold text-foreground mb-1">Book Your Session</h1>
        <p className="text-sm text-muted-foreground mb-4">Choose from our selection of therapeutic massage and yoga services</p>
      </div>

      {/* Filters */}
      <div className="px-4 mb-4">
        <div className="bg-card rounded-xl shadow-soft border border-border/50 p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 text-sm"
              />
            </div>
            <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-44 h-9 text-sm">
                <SlidersHorizontal className="w-3.5 h-3.5 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                <SelectItem value="default">Default sorting</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <Button
              size="sm"
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              onClick={() => setSelectedCategory('all')}
              className={cn("h-7 text-xs", selectedCategory === 'all' && 'bg-sage hover:bg-sage-dark')}
            >
              All
            </Button>
            {serviceCategories.map(category => (
              <Button
                key={category.id}
                size="sm"
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                onClick={() => setSelectedCategory(category.id)}
                className={cn("h-7 text-xs", selectedCategory === category.id && 'bg-sage hover:bg-sage-dark')}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="px-4 mb-3">
        <p className="text-xs text-muted-foreground">
          {servicesLoading
            ? 'Loading services...'
            : `Showing ${filteredServiceGroups.length} of ${serviceGroups.length} services`}
        </p>
      </div>

      {/* Service Grid */}
      <div className="px-4 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {!servicesLoading && filteredServiceGroups.map((group, index) => (
            <ServiceCard
              key={group.id}
              serviceGroup={group}
              fullServices={fullServices}
              onSelect={setSelectedService}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` } as React.CSSProperties}
            />
          ))}
        </div>
        {!servicesLoading && filteredServiceGroups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No services found matching your criteria.</p>
            <Button variant="outline" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}>
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {/* Minimal footer */}
      <div className="px-4 py-3 text-center border-t border-border">
        <p className="text-xs text-muted-foreground">
          Powered by <a href="https://booking.example.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Custom Booking</a>
        </p>
      </div>
    </div>
  );
}

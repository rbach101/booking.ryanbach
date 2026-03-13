import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { serviceCategories, FullService } from "@/data/fullServiceData";
import { ServiceCard } from "@/components/booking/ServiceCard";
import { usePublicServices } from "@/hooks/usePublicServices";
import { BookingWizard, BookingDetails } from "@/components/booking/BookingWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, Check, ArrowLeft, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
const FloatingConcierge = lazy(() =>
  import("@/components/concierge/FloatingConcierge").then((m) => ({ default: m.FloatingConcierge })),
);
import { supabase } from "@/integrations/supabase/client";
import { debugLog } from "@/lib/debugLog";

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}

type SortOption = "default" | "price-low" | "price-high";

export default function BookOnlinePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [selectedService, setSelectedService] = useState<FullService | null>(null);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<BookingDetails | null>(null);
  const [businessInfo, setBusinessInfo] = useState<any>(null);
  const { toast } = useToast();
  const { data: publicServicesData, isLoading: servicesLoading } = usePublicServices();
  const serviceGroups = publicServicesData?.serviceGroups ?? [];
  const fullServices = publicServicesData?.fullServices ?? [];
  // #region agent log
  useEffect(() => {
    if (!servicesLoading && serviceGroups.length > 0) {
      debugLog('BookOnlinePage.tsx', 'Services rendered', {
        groupCount: serviceGroups.length,
        fullServiceCount: fullServices.length,
        names: serviceGroups.map((g) => g.name),
      });
    }
  }, [servicesLoading, serviceGroups, fullServices]);
  // #endregion

  // Fetch business info for AI concierge context
  useEffect(() => {
    const fetchBusinessInfo = async () => {
      const { data } = await supabase.from("business_settings").select("*").single();

      if (data) {
        setBusinessInfo({
          name: data.business_name,
          phone: data.phone,
          email: data.email,
          address: data.address,
          openingTime: data.opening_time,
          closingTime: data.closing_time,
          cancellationPolicyHours: data.cancellation_policy_hours,
        });
      }
    };
    fetchBusinessInfo();
  }, []);

  // Prepare services context for AI
  const servicesContext = useMemo(
    () =>
      serviceGroups.slice(0, 10).map((g) => ({
        name: g.name,
        duration: g.durations[0]?.duration || 60,
        price: g.durations[0]?.price || 0,
        description: g.baseDescription,
      })),
    [serviceGroups],
  );

  const filteredServiceGroups = useMemo(() => {
    let groups = [...serviceGroups];

    if (selectedCategory !== "all") {
      groups = groups.filter((g) => g.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      groups = groups.filter(
        (g) => g.name.toLowerCase().includes(query) || g.baseDescription.toLowerCase().includes(query),
      );
    }

    switch (sortBy) {
      case "price-low":
        groups.sort((a, b) => a.durations[0].price - b.durations[0].price);
        break;
      case "price-high":
        groups.sort((a, b) => {
          const aMax = Math.max(...a.durations.map((d) => d.price));
          const bMax = Math.max(...b.durations.map((d) => d.price));
          return bMax - aMax;
        });
        break;
      default:
        break;
    }

    return groups;
  }, [selectedCategory, searchQuery, sortBy, serviceGroups]);

  const handleBookingComplete = (booking: BookingDetails) => {
    setCompletedBooking(booking);
    setBookingComplete(true);

    // Fire Google Ads conversion
    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to: "AW-17359422867",
      });
    }

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

  // Booking Confirmation Screen
  if (bookingComplete && completedBooking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background">
        <Helmet>
          <title>Booking Confirmed - Custom Booking</title>
        </Helmet>

        <div className="container max-w-2xl mx-auto px-4 py-16">
          <div className="bg-card rounded-2xl shadow-medium p-8 text-center">
            <div className="w-16 h-16 bg-sage/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-sage" />
            </div>

            <h1 className="text-3xl font-display font-bold text-foreground mb-4">Booking Request Received!</h1>

            <p className="text-muted-foreground mb-8">
              Thank you for booking with Custom Booking. You will receive a confirmation email at{" "}
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
                    {completedBooking.date.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time</span>
                  <span className="font-medium">{completedBooking.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Practitioner</span>
                  <span className="font-medium">{completedBooking.practitioner?.name || "Any Available"}</span>
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
      <div className="min-h-screen bg-gradient-to-b from-cream to-background">
        <Helmet>
          <title>Book {selectedService.name} - Custom Booking</title>
        </Helmet>

        <div className="container mx-auto px-4 py-8">
          <BookingWizard
            service={selectedService}
            onBack={() => setSelectedService(null)}
            onComplete={handleBookingComplete}
          />
        </div>
      </div>
    );
  }

  // Service Catalog
  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <Helmet>
        <title>Book Your Wellness Session - Custom Booking</title>
        <meta
          name="description"
          content="Book therapeutic massage and yoga sessions in Kamuela, Hawaii. Choose from Lomi Lomi, deep tissue, couples massage, and more."
        />
      </Helmet>

      <header className="py-12 md:py-20 text-center">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
            Book Your Wellness Session Today
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose from our selection of therapeutic massage and yoga services in beautiful Kamuela, Hawaii
          </p>
        </div>
      </header>

      <div className="container mx-auto px-4 mb-8">
        <div className="bg-card rounded-xl shadow-soft border border-border/50 p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
              <SelectTrigger className="w-full md:w-48">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                <SelectItem value="default">Default sorting</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
              className={cn(selectedCategory === "all" && "bg-sage hover:bg-sage-dark")}
            >
              All Services
            </Button>
            {serviceCategories.map((category) => (
              <Button
                key={category.id}
                size="sm"
                variant={selectedCategory === category.id ? "default" : "outline"}
                onClick={() => setSelectedCategory(category.id)}
                className={cn(selectedCategory === category.id && "bg-sage hover:bg-sage-dark")}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mb-6">
        <p className="text-sm text-muted-foreground">
          {servicesLoading
            ? "Loading services..."
            : `Showing ${filteredServiceGroups.length} of ${serviceGroups.length} services`}
        </p>
      </div>

      <div className="container mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No services found matching your criteria.</p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      <footer className="border-t border-border bg-card/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-sage flex items-center justify-center">
                <Leaf className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-display font-semibold text-foreground">Custom Booking</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link to="/privacy/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
            </div>

            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Custom Booking Massage Studio</p>
          </div>
        </div>
      </footer>

      <Suspense fallback={null}>
        <FloatingConcierge
          context={{
            services: servicesContext,
            businessInfo: businessInfo || undefined,
          }}
        />
      </Suspense>
    </div>
  );
}

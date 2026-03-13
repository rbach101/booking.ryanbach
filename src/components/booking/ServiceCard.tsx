import { useState } from 'react';
import { ServiceGroup, FullService, INSURANCE_DISCLAIMER } from '@/data/fullServiceData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CSSProperties } from 'react';

interface ServiceCardProps {
  serviceGroup: ServiceGroup;
  fullServices: FullService[];
  onSelect: (service: FullService) => void;
  className?: string;
  style?: CSSProperties;
}

export function ServiceCard({ serviceGroup, fullServices, onSelect, className, style }: ServiceCardProps) {
  const [selectedDurationId, setSelectedDurationId] = useState(serviceGroup.durations[0].id);
  
  const selectedDuration = serviceGroup.durations.find(d => d.id === selectedDurationId) || serviceGroup.durations[0];
  const hasDurationOptions = serviceGroup.durations.length > 1;

  const handleBookNow = () => {
    const service = fullServices.find(s => s.id === selectedDuration.id);
    if (service) {
      onSelect(service);
    }
  };

  return (
    <div
      style={style}
      className={cn(
        "group bg-card rounded-xl shadow-soft border border-border/50 overflow-hidden transition-all duration-300 hover:shadow-medium hover:-translate-y-1",
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img 
          src={serviceGroup.image} 
          alt={serviceGroup.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          {serviceGroup.isLocal && (
            <Badge className="bg-eucalyptus text-white border-0">Local Rate</Badge>
          )}
          {serviceGroup.isOutcall && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Outcall
            </Badge>
          )}
          {serviceGroup.isCouples && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="w-3 h-3" /> Couples
            </Badge>
          )}
        </div>
      </div>
      
      <div className="p-5">
        <h3 className="font-display text-lg font-semibold text-card-foreground mb-2 line-clamp-2">
          {serviceGroup.name}
        </h3>
        
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {serviceGroup.baseDescription}
        </p>

        {/* Duration Selector */}
        {hasDurationOptions ? (
          <div className="mb-4">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Select Duration
            </label>
            <Select 
              value={selectedDurationId} 
              onValueChange={setSelectedDurationId}
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue>
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {selectedDuration.duration} min
                    </span>
                    {serviceGroup.category !== 'insurance' && (
                      <span className="font-semibold">${selectedDuration.price.toFixed(2)}</span>
                    )}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                {serviceGroup.durations.map(dur => (
                  <SelectItem key={dur.id} value={dur.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {dur.duration} min
                      </span>
                      {serviceGroup.category !== 'insurance' && (
                        <span className="font-semibold text-sage">${dur.price.toFixed(2)}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{selectedDuration.duration} min</span>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div>
            {serviceGroup.category === 'insurance' ? (
              <>
                <span className="text-xl font-semibold text-foreground">Varies</span>
                <p className="text-xs text-muted-foreground">with copay</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 max-w-[200px]">{INSURANCE_DISCLAIMER}</p>
              </>
            ) : (
              <>
                <span className="text-xl font-semibold text-foreground">${selectedDuration.price.toFixed(2)}</span>
                <p className="text-xs text-muted-foreground">${selectedDuration.depositRequired.toFixed(2)} deposit</p>
              </>
            )}
          </div>
          <Button 
            onClick={handleBookNow}
            className="bg-sage hover:bg-sage-dark text-white"
          >
            Book Now
          </Button>
        </div>
      </div>
    </div>
  );
}

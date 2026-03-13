import { Users, Check, Pencil } from 'lucide-react';
import { Room } from '@/types/booking';
import { cn } from '@/lib/utils';
import { CSSProperties, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditRoomDialog } from './EditRoomDialog';

interface RoomCardProps {
  room: Room;
  className?: string;
  style?: CSSProperties;
  onUpdate?: (room: Room) => void;
}

export function RoomCard({ room, className, style, onUpdate }: RoomCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleSave = (updatedRoom: Room) => {
    onUpdate?.(updatedRoom);
  };

  return (
    <>
      <div 
        className={cn(
          "bg-card rounded-xl shadow-soft border border-border/50 overflow-hidden transition-all duration-300 hover:shadow-medium animate-scale-in",
          className
        )}
        style={style}
      >
        {/* Header with color accent */}
        <div 
          className="h-24 relative"
          style={{ 
            background: `linear-gradient(135deg, ${room.color}, ${room.color}dd)` 
          }}
        >
          <div className="absolute bottom-4 left-4">
            <h3 className="font-display text-xl font-semibold text-primary-foreground drop-shadow-sm">
              {room.name}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 text-foreground/70 hover:text-foreground hover:bg-black/10"
            onClick={() => setIsEditOpen(true)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            {room.description}
          </p>

          {/* Capacity */}
          <div className="flex items-center gap-2 mb-4 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-card-foreground">
              Capacity: {room.capacity} {room.capacity === 1 ? 'person' : 'people'}
            </span>
          </div>

          {/* Amenities */}
          <div className="pt-4 border-t border-border/50">
            <p className="text-sm font-medium text-card-foreground mb-3">Amenities</p>
            <div className="space-y-2">
              {room.amenities.map(amenity => (
                <div 
                  key={amenity}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Check className="w-4 h-4 text-sage" />
                  {amenity}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <EditRoomDialog
        room={room}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSave={handleSave}
      />
    </>
  );
}

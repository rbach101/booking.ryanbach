import { useState } from 'react';
import { Room } from '@/types/booking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { X, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface EditRoomDialogProps {
  room: Room;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (room: Room) => void;
}

const colorPresets = [
  'hsl(200, 60%, 55%)', // Ocean blue
  'hsl(120, 40%, 50%)', // Garden green
  'hsl(150, 35%, 45%)', // Sage
  'hsl(280, 30%, 55%)', // Lavender
  'hsl(35, 45%, 50%)',  // Warm sand
  'hsl(350, 50%, 55%)', // Rose
  'hsl(45, 60%, 55%)',  // Golden
  'hsl(180, 40%, 45%)', // Teal
];

export function EditRoomDialog({ room, open, onOpenChange, onSave }: EditRoomDialogProps) {
  const [formData, setFormData] = useState<Room>(room);
  const [newAmenity, setNewAmenity] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Room name is required');
      return;
    }
    
    onSave(formData);
    onOpenChange(false);
  };

  const addAmenity = () => {
    if (newAmenity.trim() && !formData.amenities.includes(newAmenity.trim())) {
      setFormData(prev => ({
        ...prev,
        amenities: [...prev.amenities, newAmenity.trim()]
      }));
      setNewAmenity('');
    }
  };

  const removeAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.filter(a => a !== amenity)
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAmenity();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit Room</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Room Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Room Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter room name"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the room"
              rows={3}
            />
          </div>

          {/* Capacity */}
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              max={10}
              value={formData.capacity}
              onChange={e => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Room Color</Label>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full transition-all ${
                    formData.color === color 
                      ? 'ring-2 ring-offset-2 ring-primary scale-110' 
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData(prev => ({ ...prev, color }))}
                />
              ))}
            </div>
          </div>

          {/* Amenities */}
          <div className="space-y-2">
            <Label>Amenities</Label>
            <div className="flex gap-2">
              <Input
                value={newAmenity}
                onChange={e => setNewAmenity(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add amenity..."
              />
              <Button type="button" variant="outline" size="icon" onClick={addAmenity}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.amenities.map(amenity => (
                <span
                  key={amenity}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-sage/10 text-sage-dark rounded-full text-sm"
                >
                  {amenity}
                  <button
                    type="button"
                    onClick={() => removeAmenity(amenity)}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sage">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

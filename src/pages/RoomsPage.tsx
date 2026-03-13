import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { RoomCard } from '@/components/rooms/RoomCard';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Room } from '@/types/booking';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('name');

      if (error) throw error;

      const mappedRooms: Room[] = (data || []).map(room => ({
        id: room.id,
        name: room.name,
        description: room.description || '',
        capacity: room.capacity || 1,
        amenities: room.amenities || [],
        isActive: room.is_active ?? true,
        color: room.color || 'hsl(200, 60%, 55%)',
      }));

      setRooms(mappedRooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRoom = async (updatedRoom: Room) => {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({
          name: updatedRoom.name,
          description: updatedRoom.description,
          capacity: updatedRoom.capacity,
          amenities: updatedRoom.amenities,
          is_active: updatedRoom.isActive,
          color: updatedRoom.color,
        })
        .eq('id', updatedRoom.id);

      if (error) throw error;

      setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
      toast.success('Room updated successfully');
    } catch (error) {
      console.error('Error updating room:', error);
      toast.error('Failed to update room');
    }
  };

  const handleAddRoom = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          name: 'New Room',
          description: '',
          capacity: 1,
          amenities: [],
          is_active: true,
          color: 'hsl(200, 60%, 55%)',
        })
        .select()
        .single();

      if (error) throw error;

      const newRoom: Room = {
        id: data.id,
        name: data.name,
        description: data.description || '',
        capacity: data.capacity || 1,
        amenities: data.amenities || [],
        isActive: data.is_active ?? true,
        color: data.color || 'hsl(200, 60%, 55%)',
      };

      setRooms(prev => [...prev, newRoom]);
      toast.success('Room added successfully');
    } catch (error) {
      console.error('Error adding room:', error);
      toast.error('Failed to add room');
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Treatment Rooms
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your rooms and their amenities
            </p>
          </div>
          <Button variant="sage" className="gap-2" onClick={handleAddRoom}>
            <Plus className="w-4 h-4" />
            Add Room
          </Button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {rooms.map((room, index) => (
            <RoomCard 
              key={room.id} 
              room={room}
              onUpdate={handleUpdateRoom}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
    </MainLayout>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, FileText, Search, Calendar, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SOAPNote {
  id: string;
  booking_id: string | null;
  customer_id: string;
  practitioner_id: string | null;
  session_date: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  treatment_duration: number | null;
  techniques_used: string[];
  areas_treated: string[];
  pressure_level: string | null;
  follow_up_recommended: boolean;
  follow_up_notes: string | null;
  created_at: string;
  customers?: { first_name: string; last_name: string };
  practitioners?: { name: string };
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const TECHNIQUES = [
  'Swedish', 'Deep Tissue', 'Sports Massage', 'Trigger Point', 'Myofascial Release',
  'Hot Stone', 'Aromatherapy', 'Reflexology', 'Shiatsu', 'Thai Massage',
  'Cupping', 'Stretching', 'Prenatal', 'Lymphatic Drainage'
];

const BODY_AREAS = [
  'Head/Scalp', 'Face', 'Neck', 'Shoulders', 'Upper Back', 'Middle Back',
  'Lower Back', 'Chest', 'Abdomen', 'Arms', 'Forearms', 'Hands',
  'Glutes', 'Thighs', 'Hamstrings', 'Calves', 'Feet'
];

export default function SOAPNotesPage() {
  const { logAction } = useAuditLog();
  const auditLogged = useRef(false);
  const [notes, setNotes] = useState<SOAPNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<SOAPNote | null>(null);
  
  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [sessionDate, setSessionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [duration, setDuration] = useState('60');
  const [selectedTechniques, setSelectedTechniques] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [pressureLevel, setPressureLevel] = useState('medium');
  const [followUpRecommended, setFollowUpRecommended] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState('');

  useEffect(() => {
    fetchNotes();
    fetchCustomers();
    if (!auditLogged.current) {
      auditLogged.current = true;
      logAction({ action: 'view', resourceType: 'soap_note', details: { page: 'soap_notes_list' } });
    }
  }, []);

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('soap_notes')
        .select(`
          *,
          customers(first_name, last_name),
          practitioners(name)
        `)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error fetching notes:', error);
      toast.error('Failed to load SOAP notes');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email')
        .order('last_name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const resetForm = () => {
    setSelectedCustomer('');
    setSessionDate(format(new Date(), 'yyyy-MM-dd'));
    setSubjective('');
    setObjective('');
    setAssessment('');
    setPlan('');
    setDuration('60');
    setSelectedTechniques([]);
    setSelectedAreas([]);
    setPressureLevel('medium');
    setFollowUpRecommended(false);
    setFollowUpNotes('');
    setEditingNote(null);
  };

  const handleCreateNote = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEditNote = (note: SOAPNote) => {
    setEditingNote(note);
    setSelectedCustomer(note.customer_id);
    setSessionDate(note.session_date);
    setSubjective(note.subjective || '');
    setObjective(note.objective || '');
    setAssessment(note.assessment || '');
    setPlan(note.plan || '');
    setDuration(note.treatment_duration?.toString() || '60');
    setSelectedTechniques(note.techniques_used || []);
    setSelectedAreas(note.areas_treated || []);
    setPressureLevel(note.pressure_level || 'medium');
    setFollowUpRecommended(note.follow_up_recommended);
    setFollowUpNotes(note.follow_up_notes || '');
    setIsDialogOpen(true);
  };

  const handleSaveNote = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a client');
      return;
    }

    try {
      const noteData = {
        customer_id: selectedCustomer,
        session_date: sessionDate,
        subjective: subjective || null,
        objective: objective || null,
        assessment: assessment || null,
        plan: plan || null,
        treatment_duration: parseInt(duration) || null,
        techniques_used: selectedTechniques,
        areas_treated: selectedAreas,
        pressure_level: pressureLevel,
        follow_up_recommended: followUpRecommended,
        follow_up_notes: followUpNotes || null,
      };

      if (editingNote) {
        const { error } = await supabase
          .from('soap_notes')
          .update(noteData)
          .eq('id', editingNote.id);

        if (error) throw error;
        toast.success('SOAP note updated');
      } else {
        const { error } = await supabase
          .from('soap_notes')
          .insert(noteData);

        if (error) throw error;
        toast.success('SOAP note created');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchNotes();
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Failed to save SOAP note');
    }
  };

  const toggleTechnique = (technique: string) => {
    setSelectedTechniques(prev =>
      prev.includes(technique)
        ? prev.filter(t => t !== technique)
        : [...prev, technique]
    );
  };

  const toggleArea = (area: string) => {
    setSelectedAreas(prev =>
      prev.includes(area)
        ? prev.filter(a => a !== area)
        : [...prev, area]
    );
  };

  const filteredNotes = notes.filter(note => {
    const clientName = `${note.customers?.first_name || ''} ${note.customers?.last_name || ''}`.toLowerCase();
    return clientName.includes(searchTerm.toLowerCase());
  });

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">SOAP Notes</h1>
            <p className="text-muted-foreground mt-1">Document client sessions and treatment plans</p>
          </div>
          <Button onClick={handleCreateNote}>
            <Plus className="h-4 w-4 mr-2" />
            New Note
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by client name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {filteredNotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No SOAP notes yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first SOAP note to document client sessions.
              </p>
              <Button onClick={handleCreateNote}>
                <Plus className="h-4 w-4 mr-2" />
                Create Note
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredNotes.map((note) => (
              <Card key={note.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => handleEditNote(note)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {note.customers?.first_name} {note.customers?.last_name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(note.session_date), 'MMMM d, yyyy')}
                        {note.treatment_duration && ` • ${note.treatment_duration} min`}
                        {note.practitioners?.name && ` • ${note.practitioners.name}`}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {note.pressure_level && (
                        <Badge variant="outline">{note.pressure_level}</Badge>
                      )}
                      {note.follow_up_recommended && (
                        <Badge variant="secondary">Follow-up</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 text-sm">
                    {note.subjective && (
                      <div>
                        <span className="font-medium">S:</span>{' '}
                        <span className="text-muted-foreground">{note.subjective.substring(0, 100)}...</span>
                      </div>
                    )}
                    {note.areas_treated && note.areas_treated.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {note.areas_treated.slice(0, 5).map(area => (
                          <Badge key={area} variant="secondary" className="text-xs">{area}</Badge>
                        ))}
                        {note.areas_treated.length > 5 && (
                          <Badge variant="secondary" className="text-xs">+{note.areas_treated.length - 5}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* SOAP Note Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingNote ? 'Edit SOAP Note' : 'New SOAP Note'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Client</Label>
                  <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.first_name} {c.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Session Date</Label>
                  <Input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Subjective (Client's Report)</Label>
                  <Textarea
                    value={subjective}
                    onChange={(e) => setSubjective(e.target.value)}
                    placeholder="Client reported pain in lower back, rating 6/10..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Objective (Your Findings)</Label>
                  <Textarea
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="Observed tension in trapezius, limited ROM in cervical spine..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Assessment</Label>
                  <Textarea
                    value={assessment}
                    onChange={(e) => setAssessment(e.target.value)}
                    placeholder="Muscular tension likely related to desk work posture..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Plan</Label>
                  <Textarea
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    placeholder="Recommend bi-weekly sessions, stretching routine provided..."
                    rows={3}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Pressure Level</Label>
                <div className="flex gap-2">
                  {['light', 'medium', 'firm', 'deep'].map(level => (
                    <Button
                      key={level}
                      type="button"
                      variant={pressureLevel === level ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPressureLevel(level)}
                      className="capitalize"
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Techniques Used</Label>
                <div className="flex flex-wrap gap-2">
                  {TECHNIQUES.map(technique => (
                    <Badge
                      key={technique}
                      variant={selectedTechniques.includes(technique) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleTechnique(technique)}
                    >
                      {technique}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Areas Treated</Label>
                <div className="flex flex-wrap gap-2">
                  {BODY_AREAS.map(area => (
                    <Badge
                      key={area}
                      variant={selectedAreas.includes(area) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleArea(area)}
                    >
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={followUpRecommended}
                    onCheckedChange={setFollowUpRecommended}
                  />
                  <Label>Follow-up recommended</Label>
                </div>
                {followUpRecommended && (
                  <Textarea
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                    placeholder="Follow-up notes..."
                    rows={2}
                  />
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveNote}>
                  {editingNote ? 'Update Note' : 'Save Note'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

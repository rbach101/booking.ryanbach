import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Eye } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function EmailTemplates() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);

  const [form, setForm] = useState({
    name: '',
    subject: '',
    body_html: '',
    body_text: '',
    category: 'general',
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const openNew = () => {
    setEditingTemplate(null);
    setForm({ name: '', subject: '', body_html: '', body_text: '', category: 'general' });
    setIsDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingTemplate(t);
    setForm({
      name: t.name,
      subject: t.subject,
      body_html: t.body_html,
      body_text: t.body_text || '',
      category: t.category,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.body_html) {
      return toast.error('Name, subject, and body are required');
    }

    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('email_templates')
          .update(form)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated');
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert(form);
        if (error) throw error;
        toast.success('Template created');
      }
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      setIsDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openDeleteDialog = (t: { id: string; name: string }) => {
    setTemplateToDelete(t);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    const id = templateToDelete.id;
    setDeleteDialogOpen(false);
    setTemplateToDelete(null);
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Template deleted');
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    }
  };

  const categoryColors: Record<string, string> = {
    general: 'bg-muted text-muted-foreground',
    reminders: 'bg-blue-100 text-blue-700',
    'follow-up': 'bg-green-100 text-green-700',
    promotions: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Email Templates</h2>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates?.map((t: any) => (
            <Card key={t.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1 truncate">{t.subject}</p>
                  </div>
                  <Badge className={categoryColors[t.category] || categoryColors.general}>
                    {t.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(t)}>
                    <Edit2 className="w-3 h-3" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => { setPreviewHtml(t.body_html); setShowPreview(true); }}
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => openDeleteDialog(t)} aria-label="Delete template">
                    <Trash2 className="w-3 h-3" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Template Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="general, reminders, etc." />
              </div>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <Label>Body (HTML)</Label>
              <Textarea
                value={form.body_html}
                onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label>Plain Text Fallback</Label>
              <Textarea
                value={form.body_text}
                onChange={(e) => setForm({ ...form, body_text: e.target.value })}
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingTemplate ? 'Update' : 'Create'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          <div
            className="border rounded-lg p-4"
            dangerouslySetInnerHTML={{
              __html: previewHtml
                .replace(/\{\{client_name\}\}/g, 'John Doe')
                .replace(/\{\{email\}\}/g, 'john@example.com')
                .replace(/\{\{message\}\}/g, 'Your custom message here...'),
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{templateToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

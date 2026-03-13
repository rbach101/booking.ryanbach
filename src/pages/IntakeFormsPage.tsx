import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Edit2, Trash2, Eye, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'checkbox' | 'select' | 'date' | 'signature';
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface IntakeFormTemplate {
  id: string;
  name: string;
  description: string | null;
  form_fields: FormField[];
  is_active: boolean;
  is_required: boolean;
  service_ids: string[];
  created_at: string;
}

const defaultHealthHistoryFields: FormField[] = [
  { id: '1', type: 'text', label: 'Emergency Contact Name', required: true },
  { id: '2', type: 'text', label: 'Emergency Contact Phone', required: true },
  { id: '3', type: 'checkbox', label: 'Are you currently under medical supervision?', required: false },
  { id: '4', type: 'textarea', label: 'Please list any current medications', required: false },
  { id: '5', type: 'textarea', label: 'Do you have any allergies? (including massage oils/lotions)', required: true },
  { id: '6', type: 'checkbox', label: 'Have you had surgery in the past year?', required: false },
  { id: '7', type: 'textarea', label: 'Please describe any areas of pain or tension', required: false },
  { id: '8', type: 'select', label: 'Preferred pressure level', required: true, options: ['Light', 'Medium', 'Firm', 'Deep'] },
  { id: '9', type: 'checkbox', label: 'I consent to massage therapy treatment', required: true },
  { id: '10', type: 'signature', label: 'Client Signature', required: true },
];

export default function IntakeFormsPage() {
  const [templates, setTemplates] = useState<IntakeFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<IntakeFormTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [isRequired, setIsRequired] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('intake_form_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Parse the form_fields JSON
      const parsedTemplates = (data || []).map(template => ({
        ...template,
        form_fields: typeof template.form_fields === 'string' 
          ? JSON.parse(template.form_fields) 
          : template.form_fields || []
      }));
      
      setTemplates(parsedTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load intake forms');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDescription('');
    setFormFields([]);
    setIsRequired(true);
    setIsDialogOpen(true);
  };

  const handleEditTemplate = (template: IntakeFormTemplate) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormDescription(template.description || '');
    setFormFields(template.form_fields);
    setIsRequired(template.is_required);
    setIsDialogOpen(true);
  };

  const handleUseDefaultTemplate = () => {
    setFormName('Health History & Consent Form');
    setFormDescription('Standard intake form for new massage therapy clients including health history, consent, and preferences.');
    setFormFields(defaultHealthHistoryFields);
  };

  const handleAddField = () => {
    const newField: FormField = {
      id: Date.now().toString(),
      type: 'text',
      label: 'New Field',
      required: false,
    };
    setFormFields([...formFields, newField]);
  };

  const handleUpdateField = (id: string, updates: Partial<FormField>) => {
    setFormFields(formFields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleRemoveField = (id: string) => {
    setFormFields(formFields.filter(f => f.id !== id));
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...formFields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setFormFields(newFields);
  };

  const handleSaveTemplate = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a form name');
      return;
    }

    if (formFields.length === 0) {
      toast.error('Please add at least one field');
      return;
    }

    try {
      const templateData = {
        name: formName,
        description: formDescription || null,
        form_fields: JSON.parse(JSON.stringify(formFields)),
        is_required: isRequired,
        is_active: true,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('intake_form_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Form template updated');
      } else {
        const { error } = await supabase
          .from('intake_form_templates')
          .insert([templateData]);

        if (error) throw error;
        toast.success('Form template created');
      }

      setIsDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save form template');
    }
  };

  const handleToggleActive = async (template: IntakeFormTemplate) => {
    try {
      const { error } = await supabase
        .from('intake_form_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;
      toast.success(template.is_active ? 'Form deactivated' : 'Form activated');
      fetchTemplates();
    } catch (error) {
      console.error('Error toggling template:', error);
      toast.error('Failed to update form');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this form template?')) return;

    try {
      const { error } = await supabase
        .from('intake_form_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Form template deleted');
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete form template');
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Intake Forms</h1>
            <p className="text-muted-foreground mt-1">Create and manage client intake forms</p>
          </div>
          <Button onClick={handleCreateTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            New Form
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No intake forms yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first intake form to collect client health history and consent.
              </p>
              <Button onClick={handleCreateTemplate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Form
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <Card key={template.id} className={!template.is_active ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {template.form_fields.length} fields
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant={template.is_active ? 'default' : 'secondary'}>
                        {template.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {template.is_required && (
                        <Badge variant="outline">Required</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {template.description && (
                    <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)}>
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleToggleActive(template)}>
                      <Eye className="h-4 w-4 mr-1" />
                      {template.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteTemplate(template.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Form Builder Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Edit Intake Form' : 'Create Intake Form'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={handleUseDefaultTemplate}>
                    Use Default Health History Template
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="formName">Form Name</Label>
                    <Input
                      id="formName"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., Health History Form"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isRequired"
                      checked={isRequired}
                      onCheckedChange={setIsRequired}
                    />
                    <Label htmlFor="isRequired">Required for booking</Label>
                  </div>
                </div>

                <div>
                  <Label htmlFor="formDescription">Description</Label>
                  <Textarea
                    id="formDescription"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Brief description of this form..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Form Fields</h3>
                  <Button variant="outline" size="sm" onClick={handleAddField}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </div>

                {formFields.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No fields yet. Add fields or use a default template.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formFields.map((field, index) => (
                      <div key={field.id} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                        <div className="flex flex-col gap-0.5 mt-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => handleMoveField(index, 'up')}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === formFields.length - 1} onClick={() => handleMoveField(index, 'down')}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex-1 grid gap-3 sm:grid-cols-4">
                          <div className="sm:col-span-2">
                            <Input
                              value={field.label}
                              onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                              placeholder="Field label"
                            />
                          </div>
                          <Select
                            value={field.type}
                            onValueChange={(value) => handleUpdateField(field.id, { type: value as FormField['type'] })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="textarea">Long Text</SelectItem>
                              <SelectItem value="checkbox">Checkbox</SelectItem>
                              <SelectItem value="select">Dropdown</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="signature">Signature</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(checked) => handleUpdateField(field.id, { required: checked })}
                            />
                            <span className="text-sm">Required</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveField(field.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTemplate}>
                  {editingTemplate ? 'Update Form' : 'Create Form'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

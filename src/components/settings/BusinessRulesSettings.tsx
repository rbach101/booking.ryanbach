import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Shield, ShieldAlert, ShieldCheck, Loader2, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface BusinessRule {
  id: string;
  rule_text: string;
  category: string;
  severity: string;
  is_active: boolean;
  created_at: string;
}

interface RuleViolation {
  id: string;
  rule_id: string | null;
  booking_id: string;
  violation_description: string;
  severity: string;
  resolved: boolean;
  created_at: string;
}

export function BusinessRulesSettings() {
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [newCategory, setNewCategory] = useState('booking');
  const [newSeverity, setNewSeverity] = useState('warning');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchRules();
    fetchViolations();
  }, []);

  const fetchRules = async () => {
    try {
      const { data, error } = await supabase
        .from('business_rules')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setRules(data || []);
    } catch (err) {
      console.error('Error fetching rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchViolations = async () => {
    try {
      const { data, error } = await supabase
        .from('rule_violations')
        .select('*')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setViolations(data || []);
    } catch (err) {
      console.error('Error fetching violations:', err);
    }
  };

  const addRule = async () => {
    if (!newRule.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('business_rules').insert({
        rule_text: newRule.trim(),
        category: newCategory,
        severity: newSeverity,
      });
      if (error) throw error;
      setNewRule('');
      toast.success('Rule added');
      fetchRules();
    } catch (err) {
      console.error('Error adding rule:', err);
      toast.error('Failed to add rule');
    } finally {
      setAdding(false);
    }
  };

  const toggleRule = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('business_rules')
        .update({ is_active: !isActive })
        .eq('id', id);
      if (error) throw error;
      setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !isActive } : r));
    } catch (err) {
      toast.error('Failed to update rule');
    }
  };

  const deleteRule = async (id: string) => {
    try {
      const { error } = await supabase.from('business_rules').delete().eq('id', id);
      if (error) throw error;
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success('Rule deleted');
    } catch (err) {
      toast.error('Failed to delete rule');
    }
  };

  const resolveViolation = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('rule_violations')
        .update({ resolved: true, resolved_by: user?.id, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setViolations(prev => prev.filter(v => v.id !== id));
      toast.success('Violation resolved');
    } catch (err) {
      toast.error('Failed to resolve violation');
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-bookings');
      if (error) throw error;
      const result = data as any;
      if (result.violations?.length > 0) {
        toast.warning(`${result.violations.length} violation(s) found!`);
      } else {
        toast.success(result.message || 'No violations found');
      }
      fetchViolations();
    } catch (err: any) {
      console.error('Scan error:', err);
      toast.error(err.message || 'Failed to run scan');
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Violations */}
      {violations.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Active Violations ({violations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {violations.map(v => (
              <div key={v.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-background border">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={v.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                      {v.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm">{v.violation_description}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => resolveViolation(v.id)} className="shrink-0">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Resolve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add New Rule */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display">Business Rules</CardTitle>
              <CardDescription>
                Define rules in plain English. The AI monitor will check bookings against these rules.
              </CardDescription>
            </div>
            <Button
              variant="sage"
              size="sm"
              onClick={runScan}
              disabled={scanning || rules.length === 0}
              className="gap-2"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {scanning ? 'Scanning...' : 'Run Scan'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <Textarea
              placeholder="Type a rule in plain English, e.g. 'Only Alea can perform massage services' or 'No bookings before 8am on weekdays'"
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              className="min-h-[80px] bg-background"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booking">Booking</SelectItem>
                  <SelectItem value="scheduling">Scheduling</SelectItem>
                  <SelectItem value="practitioner">Practitioner</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newSeverity} onValueChange={setNewSeverity}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warning">⚠️ Warning</SelectItem>
                  <SelectItem value="critical">🚨 Critical</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addRule} disabled={adding || !newRule.trim()} className="gap-2">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Rule
              </Button>
            </div>
          </div>

          {/* Existing Rules */}
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No rules defined yet. Add your first rule above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    rule.is_active ? 'bg-background' : 'bg-muted/50 opacity-60'
                  }`}
                >
                  <div className="pt-0.5">
                    {rule.severity === 'critical' ? (
                      <ShieldAlert className="w-4 h-4 text-destructive" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm">{rule.rule_text}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{rule.category}</Badge>
                      <Badge variant={rule.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                        {rule.severity}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => toggleRule(rule.id, rule.is_active)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
            <p className="font-medium mb-1">ℹ️ How it works:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><strong>Database triggers</strong> automatically block practitioner-service mismatches at the database level</li>
              <li><strong>AI Monitor</strong> scans recent bookings against your custom rules and flags violations</li>
              <li>Click "Run Scan" to check recent bookings, or set up a scheduled scan for continuous monitoring</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

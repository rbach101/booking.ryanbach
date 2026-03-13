import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Shield, CheckCircle2, Loader2, FileText, PenTool } from 'lucide-react';
import { format } from 'date-fns';

const BAA_VERSION = '1.0';

const BAA_TEXT = `BUSINESS ASSOCIATE AGREEMENT

This Business Associate Agreement ("Agreement") is entered into between Custom Booking ("Covered Entity") and the undersigned practitioner/staff member ("Business Associate"), collectively referred to as the "Parties."

1. DEFINITIONS

a) "Protected Health Information" or "PHI" means individually identifiable health information, including demographic data, that relates to the individual's past, present, or future physical or mental health condition, the provision of health care, or payment for health care.

b) "Electronic Protected Health Information" or "ePHI" means PHI that is transmitted or maintained in electronic media.

c) "Breach" means the acquisition, access, use, or disclosure of PHI in a manner not permitted under HIPAA that compromises the security or privacy of the PHI.

2. OBLIGATIONS OF BUSINESS ASSOCIATE

Business Associate agrees to:

a) Not use or disclose PHI other than as permitted or required by this Agreement or as required by law.

b) Use appropriate safeguards to prevent use or disclosure of PHI other than as provided for by this Agreement.

c) Implement administrative, physical, and technical safeguards that reasonably and appropriately protect the confidentiality, integrity, and availability of ePHI.

d) Report to Covered Entity any use or disclosure of PHI not provided for by this Agreement of which Business Associate becomes aware, including any Breach of Unsecured PHI.

e) Ensure that any subcontractors that create, receive, maintain, or transmit PHI on behalf of Business Associate agree to the same restrictions and conditions.

f) Make available PHI in accordance with the individual's right of access under HIPAA.

g) Make PHI available for amendment and incorporate any amendments to PHI as directed by the Covered Entity.

h) Document disclosures of PHI and information related to such disclosures as would be required for the Covered Entity to respond to a request for an accounting of disclosures.

3. PERMITTED USES AND DISCLOSURES

a) Business Associate may use or disclose PHI as necessary to perform services on behalf of and for the benefit of the Covered Entity, including but not limited to: providing massage therapy services, maintaining SOAP notes, managing client intake forms, and scheduling appointments.

b) Business Associate may use PHI for proper management and administration or to carry out legal responsibilities of the Business Associate.

4. OBLIGATIONS OF COVERED ENTITY

Covered Entity shall:

a) Notify Business Associate of any limitations in its notice of privacy practices.
b) Notify Business Associate of any changes in, or revocation of, permission by an individual to use or disclose PHI.
c) Notify Business Associate of any restriction to the use or disclosure of PHI that Covered Entity has agreed to.

5. TERM AND TERMINATION

a) This Agreement shall remain in effect for the duration of the Business Associate's employment or contractual relationship with the Covered Entity.

b) Either Party may terminate this Agreement if the other Party has materially breached this Agreement and has not cured the breach within 30 days of receiving written notice.

c) Upon termination, Business Associate shall return or destroy all PHI received from the Covered Entity, or created or received by Business Associate on behalf of the Covered Entity.

6. BREACH NOTIFICATION

a) Business Associate shall report any Breach of Unsecured PHI to the Covered Entity without unreasonable delay and in no case later than 60 days after discovery.

b) Such notification shall include the identification of each individual whose PHI has been, or is reasonably believed to have been, accessed, acquired, used, or disclosed during the Breach.

7. MISCELLANEOUS

a) This Agreement shall be governed by the laws of the applicable state and federal HIPAA regulations.

b) Any ambiguity in this Agreement shall be interpreted to permit compliance with HIPAA.

c) This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof.

By signing below, you acknowledge that you have read, understood, and agree to the terms of this Business Associate Agreement.`;

export default function BAAPage() {
  const { user } = useAuth();
  const [existingSignature, setExistingSignature] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (user) {
      fetchExistingSignature();
      setSignerName(user.user_metadata?.full_name || user.email || '');
    }
  }, [user]);

  const fetchExistingSignature = async () => {
    try {
      const { data, error } = await supabase
        .from('baa_signatures')
        .select('*')
        .eq('user_id', user!.id)
        .order('signed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setExistingSignature(data);
    } catch (error) {
      console.error('Error fetching BAA signature:', error);
    } finally {
      setLoading(false);
    }
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'hsl(var(--foreground))';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSign = async () => {
    if (!signerName.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    if (!hasSignature) {
      toast.error('Please draw your signature');
      return;
    }

    setSigning(true);
    try {
      const canvas = canvasRef.current;
      const signatureData = canvas?.toDataURL('image/png') || '';

      const { error } = await supabase
        .from('baa_signatures')
        .insert({
          user_id: user!.id,
          signer_name: signerName.trim(),
          signer_email: user!.email || '',
          signer_title: signerTitle.trim() || null,
          organization_name: organizationName.trim() || null,
          signature_data: signatureData,
          baa_version: BAA_VERSION,
        });

      if (error) throw error;

      toast.success('BAA signed successfully');
      fetchExistingSignature();
    } catch (error) {
      console.error('Error signing BAA:', error);
      toast.error('Failed to sign BAA');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground flex items-center gap-3">
            <Shield className="w-8 h-8 text-sage" />
            Business Associate Agreement
          </h1>
          <p className="text-muted-foreground mt-1">
            HIPAA-required agreement for handling Protected Health Information (PHI)
          </p>
        </div>

        {existingSignature && (
          <Card className="border-sage/30 bg-sage/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-sage flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">BAA Signed</h3>
                    <Badge variant="secondary" className="bg-sage/20 text-sage">v{existingSignature.baa_version}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Signed by <span className="font-medium text-foreground">{existingSignature.signer_name}</span> on{' '}
                    {format(new Date(existingSignature.signed_at), 'MMMM d, yyyy \'at\' h:mm a')}
                  </p>
                  {existingSignature.signer_title && (
                    <p className="text-sm text-muted-foreground">Title: {existingSignature.signer_title}</p>
                  )}
                  {existingSignature.signature_data && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1">Signature:</p>
                      <img 
                        src={existingSignature.signature_data} 
                        alt="Signature" 
                        className="h-16 border rounded bg-background p-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Agreement Text
            </CardTitle>
            <CardDescription>
              Please read the entire agreement carefully before signing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border p-6 bg-muted/30">
              <pre className="whitespace-pre-wrap font-body text-sm text-foreground leading-relaxed">
                {BAA_TEXT}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>

        {!existingSignature && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <PenTool className="w-5 h-5" />
                Sign Agreement
              </CardTitle>
              <CardDescription>
                Enter your details and draw your signature below
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="signerName">Full Name *</Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Your full legal name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signerTitle">Title / Position</Label>
                  <Input
                    id="signerTitle"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    placeholder="e.g., Licensed Massage Therapist"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization (if applicable)</Label>
                <Input
                  id="orgName"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Your business or organization name"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Signature *</Label>
                  <Button variant="ghost" size="sm" onClick={clearSignature}>
                    Clear
                  </Button>
                </div>
                <div className="border rounded-lg bg-background p-1">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={150}
                    className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Draw your signature in the box above using your mouse or touchscreen
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="sage"
                  onClick={handleSign}
                  disabled={signing || !signerName.trim() || !hasSignature}
                  className="gap-2"
                >
                  {signing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    <>
                      <PenTool className="w-4 h-4" />
                      Sign BAA
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

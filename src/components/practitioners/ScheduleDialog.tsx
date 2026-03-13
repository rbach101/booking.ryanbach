import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScheduleEditor } from './ScheduleEditor';

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitionerId: string;
  practitionerName: string;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  practitionerId,
  practitionerName,
}: ScheduleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="sr-only">Edit Schedule</DialogTitle>
        </DialogHeader>
        <ScheduleEditor
          practitionerId={practitionerId}
          practitionerName={practitionerName}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

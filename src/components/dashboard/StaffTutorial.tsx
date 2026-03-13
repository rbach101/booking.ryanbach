import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Calendar, Users, Bell, Clock, CheckCircle, 
  ChevronRight, ChevronLeft, X, BookOpen,
  CalendarCheck, MessageSquare, UserCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TutorialStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  tips: string[];
}

const tutorialSteps: TutorialStep[] = [
  {
    icon: <Calendar className="w-8 h-8" />,
    title: "Calendar Overview",
    description: "View and manage all appointments at a glance. Switch between practitioner and room views to see availability.",
    tips: [
      "Use the date picker to navigate to specific days",
      "Click on any appointment to view details",
      "Blocked times from Google Calendar sync automatically"
    ]
  },
  {
    icon: <CalendarCheck className="w-8 h-8" />,
    title: "Approving Bookings",
    description: "New bookings from clients appear as 'Pending'. Review and approve them to confirm the appointment.",
    tips: [
      "Go to the Bookings page to see pending requests",
      "Approving a booking charges the deposit automatically",
      "Declined bookings notify the client via email"
    ]
  },
  {
    icon: <Users className="w-8 h-8" />,
    title: "Customer Management",
    description: "Access the CRM to view and manage all customer information and booking history.",
    tips: [
      "Search customers by name, email, or phone",
      "View past appointments and notes for each customer",
      "Add tags to organize customers into groups"
    ]
  },
  {
    icon: <Clock className="w-8 h-8" />,
    title: "Creating Appointments",
    description: "Create appointments directly for walk-ins or phone bookings using the 'New Booking' button.",
    tips: [
      "Use 'Auto Approve' to skip the pending queue for walk-ins",
      "Use 'Pay in Full' when the client pays cash or card on-site",
      "You can combine both toggles for instant confirmed & paid bookings",
      "Add notes for special requests or preferences"
    ]
  },
  {
    icon: <Bell className="w-8 h-8" />,
    title: "Notifications",
    description: "Stay updated with real-time notifications for new bookings, changes, and messages.",
    tips: [
      "Click the bell icon to see all notifications",
      "Use quick-action links to approve bookings fast",
      "Check the Messages page for internal team notes"
    ]
  },
  {
    icon: <UserCheck className="w-8 h-8" />,
    title: "Your Schedule",
    description: "Manage your personal availability and view your upcoming appointments from the dashboard.",
    tips: [
      "Set your weekly availability in My Settings",
      "Connect your Google Calendar to sync busy times",
      "Your assigned bookings appear on your dashboard"
    ]
  }
];

interface StaffTutorialProps {
  open: boolean;
  onClose: () => void;
}

export function StaffTutorial({ open, onClose }: StaffTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('staff_tutorial_completed', 'true');
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem('staff_tutorial_completed', 'true');
    onClose();
  };

  const step = tutorialSteps[currentStep];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sage">
              <BookOpen className="w-5 h-5" />
              <span className="text-sm font-medium">Quick Start Guide</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {tutorialSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === currentStep 
                  ? "bg-sage w-6" 
                  : index < currentStep 
                    ? "bg-sage/50" 
                    : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="text-center py-4">
          <div className="w-16 h-16 mx-auto mb-4 bg-sage/10 rounded-2xl flex items-center justify-center text-sage">
            {step.icon}
          </div>
          <DialogTitle className="text-xl mb-2">{step.title}</DialogTitle>
          <DialogDescription className="text-base">
            {step.description}
          </DialogDescription>
        </div>

        {/* Tips */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Quick Tips:</p>
          {step.tips.map((tip, index) => (
            <div key={index} className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-sage mt-0.5 shrink-0" />
              <span>{tip}</span>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          
          <span className="text-sm text-muted-foreground">
            {currentStep + 1} of {tutorialSteps.length}
          </span>

          <Button
            variant="sage"
            onClick={handleNext}
            className="gap-1"
          >
            {currentStep === tutorialSteps.length - 1 ? (
              <>
                Get Started
                <CheckCircle className="w-4 h-4" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage tutorial state
export function useStaffTutorial() {
  const [showTutorial, setShowTutorial] = useState(false);

  // Tutorial no longer auto-shows on login; only opens via Help Guide button

  const openTutorial = () => setShowTutorial(true);
  const closeTutorial = () => setShowTutorial(false);

  return { showTutorial, openTutorial, closeTutorial };
}

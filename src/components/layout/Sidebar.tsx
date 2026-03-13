import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  Users, 
  Home, 
  Clock, 
  Settings, 
  Menu,
  X,
  Leaf,
  LogOut,
  UserCircle,
  MessageSquare,
  ClipboardList,
  FileText,
  UserPlus,
  CreditCard,
  Shield,
  BookOpen,
  Mail,
  Terminal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { prefetchRoute } from '@/lib/prefetch';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardAlerts } from '@/hooks/useDashboardAlerts';
import { toast } from 'sonner';
import { NotificationBell } from '@/components/notifications/NotificationBell';


const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: Home, adminOnly: false },
  { path: '/calendar', label: 'Calendar', icon: Calendar, adminOnly: false },
  { path: '/customers', label: 'Customers', icon: UserCircle, adminOnly: false },
  { path: '/practitioners', label: 'Practitioners', icon: Users, adminOnly: true },
  { path: '/services', label: 'Services & Extras', icon: Leaf, adminOnly: true },
  { path: '/rooms', label: 'Rooms', icon: Home, adminOnly: true },
  { path: '/bookings', label: 'Bookings', icon: Clock, adminOnly: false },
  { path: '/messages', label: 'Messages', icon: MessageSquare, adminOnly: false },
  { path: '/intake-forms', label: 'Intake Forms', icon: ClipboardList, adminOnly: false },
  { path: '/soap-notes', label: 'SOAP Notes', icon: FileText, adminOnly: false },
  { path: '/waitlist', label: 'Waitlist', icon: UserPlus, adminOnly: false },
  { path: '/memberships', label: 'Memberships', icon: CreditCard, adminOnly: false },
  { path: '/email', label: 'Email', icon: Mail, adminOnly: true },
  { path: '/my-settings', label: 'My Settings', icon: Settings, adminOnly: false, staffOnly: true },
  { path: '/baa', label: 'HIPAA BAA', icon: Shield, adminOnly: false },
  { path: '/admin-guide', label: 'Admin Guide', icon: BookOpen, adminOnly: true },
  { path: '/dev', label: 'Dev Dashboard', icon: Terminal, adminOnly: true },
  { path: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  const alertCount = useDashboardAlerts();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/auth');
  };

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden relative"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close menu' : `Open menu${alertCount > 0 ? ` (${alertCount} alerts)` : ''}`}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        {alertCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 min-w-4 rounded-full bg-terracotta text-[10px] font-medium text-white flex items-center justify-center px-1">
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </Button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-out",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sage flex items-center justify-center shadow-soft">
                <Leaf className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-xl font-semibold text-sidebar-foreground">Custom Booking</h1>
                <p className="text-xs text-muted-foreground">Booking System</p>
              </div>
            </div>
            <NotificationBell />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems
              .filter((item) => {
                // Hide admin-only items from non-admins
                if (item.adminOnly && !isAdmin) return false;
                // Hide staff-only items from admins (they have full settings)
                if (item.staffOnly && isAdmin) return false;
                return true;
              })
              .map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    onMouseEnter={() => prefetchRoute(item.path)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg font-body text-sm transition-all duration-200 ease-out",
                      isActive 
                        ? "bg-sidebar-accent text-sidebar-primary font-medium shadow-soft" 
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                    )}
                  >
                    <Icon className={cn("w-5 h-5", isActive && "text-sidebar-primary")} />
                    {item.label}
                  </NavLink>
                );
              })}
          </nav>

          {/* User info and logout */}
          <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
            {user && (
              <div className="px-4 py-2">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? 'Admin' : 'Staff'}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </Button>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-sidebar-border">
            <p className="text-xs text-muted-foreground text-center">
              © {new Date().getFullYear()} Custom Booking
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  requiresPasswordChange: boolean;
  clearPasswordChangeRequired: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  
  // Track which user's roles we've already fetched to prevent duplicate calls
  const lastRolesFetchedFor = useRef<string | null>(null);
  const initialSessionHandled = useRef(false);

  const checkPasswordChangeRequired = (user: User | null) => {
    if (user?.user_metadata?.password_change_required === true) {
      setRequiresPasswordChange(true);
    } else {
      setRequiresPasswordChange(false);
    }
  };

  const clearPasswordChangeRequired = () => {
    setRequiresPasswordChange(false);
  };

  const checkUserRoles = useCallback(async (userId: string) => {
    // Skip if we already fetched roles for this user
    if (lastRolesFetchedFor.current === userId) return;
    lastRolesFetchedFor.current = userId;
    
    setRolesLoading(true);
    try {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (roles) {
        setIsAdmin(roles.some(r => r.role === 'admin'));
        setIsStaff(roles.some(r => r.role === 'staff' || r.role === 'admin'));
      }
    } catch (error) {
      console.error('Error checking roles:', error);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const handleSession = useCallback((session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false);
    checkPasswordChangeRequired(session?.user ?? null);

    if (session?.user) {
      checkUserRoles(session.user.id);
    } else {
      lastRolesFetchedFor.current = null;
      setIsAdmin(false);
      setIsStaff(false);
      setRolesLoading(false);
    }
  }, [checkUserRoles]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // If initial session already handled, only process actual changes
        if (initialSessionHandled.current && event === 'INITIAL_SESSION') return;
        
        // On sign out, reset the roles cache
        if (event === 'SIGNED_OUT') {
          lastRolesFetchedFor.current = null;
        }
        
        handleSession(session);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!initialSessionHandled.current) {
        initialSessionHandled.current = true;
        handleSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [handleSession]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      rolesLoading,
      isAdmin,
      isStaff,
      requiresPasswordChange,
      clearPasswordChangeRequired,
      signIn,
      signUp,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

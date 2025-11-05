import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://arhoasurtfurjgfohlgt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyaG9hc3VydGZ1cmpnZm9obGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDQ5MDIsImV4cCI6MjA3NzgyMDkwMn0.FwXMPAnBpOhZnAg90PUQttaSvpgvVbRb_xNctF-reWw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  email_confirmed?: boolean;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
  try {
    // Try to sign in - Supabase will block if email not confirmed
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Check if error is about email confirmation
      const errorMessage = error.message?.toLowerCase() || '';
      const isEmailConfirmationError = 
        errorMessage.includes('email') && 
        (errorMessage.includes('confirm') || errorMessage.includes('verify') || errorMessage.includes('not confirmed'));
      
      if (isEmailConfirmationError) {
        // Return a special error that the UI can handle
        const confirmationError = new Error('נא לאמת את האימייל שלך לפני ההתחברות. בדוק את תיבת הדואר שלך.');
        (confirmationError as any).code = 'email_not_confirmed';
        (confirmationError as any).originalError = error;
        return { user: null, error: confirmationError };
      }
      
      // Translate common error messages to Hebrew
      if (errorMessage.includes('invalid login credentials') || 
          errorMessage.includes('invalid credentials') ||
          errorMessage.includes('email not found') ||
          errorMessage.includes('wrong password') ||
          errorMessage.includes('incorrect password')) {
        return { user: null, error: new Error('פרטי התחברות לא תקינים. אנא בדוק את האימייל והסיסמה שלך.') };
      }
      
      return { user: null, error: error };
    }

    // Check if email is confirmed before allowing login
    if (!data.user.email_confirmed_at) {
      // Email not confirmed - block login
      const confirmationError = new Error('נא לאמת את האימייל שלך לפני ההתחברות. בדוק את תיבת הדואר שלך.');
      (confirmationError as any).code = 'email_not_confirmed';
      return { user: null, error: confirmationError };
    }

    // Success - user logged in and email is confirmed
    const user: User = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
      avatar_url: data.user.user_metadata?.avatar_url,
      email_confirmed: !!data.user.email_confirmed_at,
    };

    return { user, error: null };
  } catch (error) {
    return { user: null, error: error instanceof Error ? error : new Error('Unknown error during sign in') };
  }
}

/**
 * Resend email confirmation
 */
export async function resendConfirmationEmail(email: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    return { error: error || null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unknown error resending confirmation email') };
  }
}

/**
 * Refresh user data to check if email was confirmed
 * This is useful after user clicks confirmation link
 */
export async function refreshUser(): Promise<{ user: User | null; error: Error | null }> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      return { user: null, error };
    }

    if (!user) {
      return { user: null, error: null };
    }

    const refreshedUser: User = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email?.split('@')[0],
      avatar_url: user.user_metadata?.avatar_url,
      email_confirmed: !!user.email_confirmed_at,
    };

    return { user: refreshedUser, error: null };
  } catch (error) {
    return { user: null, error: error instanceof Error ? error : new Error('Unknown error refreshing user') };
  }
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email: string, password: string, name?: string): Promise<{ user: User | null; error: Error | null }> {
  try {
    // Sign up user - Supabase will send confirmation email
    // User must confirm email before they can log in
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: name || email.split('@')[0],
        },
      },
    });

    if (error) {
      // Translate common error messages to Hebrew
      const errorMessage = error.message?.toLowerCase() || '';
      if (errorMessage.includes('user already registered') ||
          errorMessage.includes('already registered') ||
          errorMessage.includes('email already exists')) {
        return { user: null, error: new Error('האימייל הזה כבר רשום במערכת. נסה להתחבר או השתמש באימייל אחר.') };
      }
      if (errorMessage.includes('password') && errorMessage.includes('weak')) {
        return { user: null, error: new Error('הסיסמה חלשה מדי. אנא בחר סיסמה חזקה יותר.') };
      }
      if (errorMessage.includes('invalid email') || errorMessage.includes('email format')) {
        return { user: null, error: new Error('פורמט אימייל לא תקין. אנא בדוק את כתובת האימייל שלך.') };
      }
      return { user: null, error: error };
    }

    // Don't log user in automatically - they need to confirm email first
    // Return null user to indicate signup was successful but login is pending confirmation
    return { user: null, error: null };
  } catch (error) {
    return { user: null, error: error instanceof Error ? error : new Error('Unknown error during sign up') };
  }
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      console.error('Google OAuth error:', error);
      // Provide more helpful error message
      if (error.message?.includes('exchange') || error.message?.includes('external code')) {
        return { 
          error: new Error('שגיאה בהתחברות עם גוגל. אנא ודא שההגדרות ב-Supabase נכונות.') 
        };
      }
      return { error };
    }

    // OAuth redirects, so we don't return here
    return { error: null };
  } catch (error) {
    console.error('Google OAuth exception:', error);
    return { 
      error: error instanceof Error 
        ? error 
        : new Error('שגיאה לא צפויה בהתחברות עם גוגל') 
    };
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    return { error: error || null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unknown error during sign out') };
  }
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    // First check for session (handles OAuth callback)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (session?.user) {
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
        avatar_url: session.user.user_metadata?.avatar_url,
        email_confirmed: !!session.user.email_confirmed_at,
      };
    }
    
    // Fallback to getUser if no session
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email?.split('@')[0],
      avatar_url: user.user_metadata?.avatar_url,
      email_confirmed: !!user.email_confirmed_at,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Listen to auth state changes
 * This includes when user confirms their email (TOKEN_REFRESHED event)
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange((event, session) => {
    // Handle different auth events
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
      // User confirmed email or session was refreshed
      // Refresh user data to get updated email_confirmed status
      if (session?.user) {
        const user: User = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          avatar_url: session.user.user_metadata?.avatar_url,
          email_confirmed: !!session.user.email_confirmed_at,
        };
        callback(user);
        return;
      }
    }
    
    if (session?.user) {
      const user: User = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
        avatar_url: session.user.user_metadata?.avatar_url,
        email_confirmed: !!session.user.email_confirmed_at,
      };
      callback(user);
    } else {
      callback(null);
    }
  });
}


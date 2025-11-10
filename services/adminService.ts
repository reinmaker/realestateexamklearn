import { supabase } from './authService';
import { UserStats } from './userStatsService';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
}

export interface UserDetails {
  id: string;
  email: string | null;
  name: string | null;
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  stats: UserStats | null;
  sessions: any[];
  topic_progress: any[];
  support_tickets: any[];
}

/**
 * Check if a user is an admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_user_admin', { user_id: userId });
    
    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
    
    return data === true;
  } catch (error) {
    console.error('Error in isAdmin:', error);
    return false;
  }
}

/**
 * Get all users with basic info
 * Uses RPC function that checks admin status
 */
export async function getAllUsers(): Promise<{ users: AdminUser[]; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('get_all_users');

    if (error) {
      console.error('Error fetching users:', error);
      return { users: [], error: error as Error };
    }

    const users: AdminUser[] = (data || []).map((user: any) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      email_confirmed: user.email_confirmed,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      is_admin: user.is_admin,
    }));

    return { users, error: null };
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    return { users: [], error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Get detailed user information
 */
export async function getUserDetails(userId: string): Promise<{ details: UserDetails | null; error: Error | null }> {
  try {
    // Get user basic info using RPC function
    const { data: userDataArray, error: userError } = await supabase.rpc('get_user_details', { user_id: userId });
    
    if (userError || !userDataArray || userDataArray.length === 0) {
      return { details: null, error: userError || new Error('User not found') };
    }

    const user = userDataArray[0];

    // Get user stats
    const { data: statsData } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get user sessions
    const { data: sessionsData } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(20);

    // Get topic progress
    const { data: topicProgressData } = await supabase
      .from('user_topic_progress')
      .select('*')
      .eq('user_id', userId);

    // Get support tickets
    const { data: ticketsData } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    const details: UserDetails = {
      id: user.id,
      email: user.email || null,
      name: user.name || null,
      email_confirmed: user.email_confirmed,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || null,
      is_admin: user.is_admin,
      stats: statsData as UserStats | null,
      sessions: sessionsData || [],
      topic_progress: topicProgressData || [],
      support_tickets: ticketsData || [],
    };

    return { details, error: null };
  } catch (error) {
    console.error('Error in getUserDetails:', error);
    return { details: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Reset user progress - delete all progress data but keep the user account
 * This will delete: stats, sessions, analysis, topic progress
 */
export async function resetUserProgress(userId: string): Promise<{ error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: new Error('Not authenticated') };
    }

    // Check if user is admin using RPC function
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_user_admin', { user_id: user.id });
    if (adminError || !isAdmin) {
      return { error: new Error('Unauthorized - Admin access required') };
    }

    // Delete all user progress data
    const errors: Error[] = [];

    // Delete user stats
    const { error: statsError } = await supabase
      .from('user_stats')
      .delete()
      .eq('user_id', userId);
    if (statsError) {
      console.error('Error deleting user stats:', statsError);
      errors.push(statsError);
    }

    // Delete user sessions
    const { error: sessionsError } = await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', userId);
    if (sessionsError) {
      console.error('Error deleting user sessions:', sessionsError);
      errors.push(sessionsError);
    }

    // Delete user analysis - delete all records for this user
    // First, try to get count of records to delete
    const { data: analysisData, error: checkError } = await supabase
      .from('user_analysis')
      .select('id')
      .eq('user_id', userId);
    
    if (checkError) {
      // If table doesn't exist, skip deletion (not an error)
      if (checkError.code === '42P01' || checkError.code === 'PGRST116' || checkError.message?.includes('does not exist')) {
        // Table doesn't exist, skip deletion
      } else {
        console.error('Error checking user analysis:', checkError);
        errors.push(checkError);
      }
    } else {
      // Delete all analysis records
      const recordCount = analysisData?.length || 0;
      
      if (recordCount > 0) {
        const { error: analysisError, count } = await supabase
          .from('user_analysis')
          .delete()
          .eq('user_id', userId)
          .select('*', { count: 'exact', head: true });
        
        if (analysisError) {
          console.error('Error deleting user analysis:', analysisError);
          console.error('Analysis error details:', {
            code: analysisError.code,
            message: analysisError.message,
            details: analysisError.details,
            hint: analysisError.hint
          });
          errors.push(analysisError);
        } else {
          // Verify deletion by checking again
          const { data: verifyData, error: verifyError } = await supabase
            .from('user_analysis')
            .select('id')
            .eq('user_id', userId);
          
          if (verifyError) {
            console.error('Error verifying deletion:', verifyError);
          } else {
            const remainingCount = verifyData?.length || 0;
            if (remainingCount > 0) {
              console.warn(`Warning: ${remainingCount} analysis records still exist after deletion`);
              // Try to delete again
              const { error: retryError } = await supabase
                .from('user_analysis')
                .delete()
                .eq('user_id', userId);
              if (retryError) {
                console.error('Retry deletion failed:', retryError);
                errors.push(retryError);
              }
            }
          }
        }
      }
    }

    // Delete user topic progress
    const { error: topicProgressError } = await supabase
      .from('user_topic_progress')
      .delete()
      .eq('user_id', userId);
    if (topicProgressError) {
      console.error('Error deleting user topic progress:', topicProgressError);
      errors.push(topicProgressError);
    }

    // Delete user-specific question data (if questions table has user_id column)
    // Check if questions table exists and has user_id column
    const { data: questionsData, error: questionsCheckError } = await supabase
      .from('questions')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    
    if (questionsCheckError) {
      // If table doesn't exist or doesn't have user_id column, skip deletion (not an error)
      if (questionsCheckError.code === '42P01' || questionsCheckError.code === 'PGRST116' || 
          questionsCheckError.code === '42703' || questionsCheckError.message?.includes('does not exist') ||
          questionsCheckError.message?.includes('column') && questionsCheckError.message?.includes('does not exist')) {
        // Table doesn't exist or doesn't have user_id column, skip deletion
      } else {
        console.error('Error checking user questions:', questionsCheckError);
        // Don't add to errors - this is optional
      }
    } else if (questionsData && questionsData.length > 0) {
      // Delete all user-specific questions
      const { error: questionsError } = await supabase
        .from('questions')
        .delete()
        .eq('user_id', userId);
      
      if (questionsError) {
        console.error('Error deleting user questions:', questionsError);
        // Don't add to errors - this is optional (questions might be shared)
      }
    }

    if (errors.length > 0) {
      return { error: new Error(`Failed to reset some user data: ${errors.map(e => e.message).join(', ')}`) };
    }

    return { error: null };
  } catch (error) {
    console.error('Error in resetUserProgress:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Delete a user and all associated data
 * Uses RPC function that checks admin status
 */
export async function deleteUser(userId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc('delete_user_admin', { user_id: userId });
    
    if (error) {
      console.error('Error deleting user:', error);
      return { error };
    }

    return { error: null };
  } catch (error) {
    console.error('Error in deleteUser:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Update user details
 * Uses RPC function that checks admin status
 */
export async function updateUser(
  userId: string,
  updates: { name?: string; email?: string; is_admin?: boolean }
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc('update_user_admin', {
      user_id: userId,
      new_name: updates.name || null,
      new_email: updates.email || null,
      new_is_admin: updates.is_admin !== undefined ? updates.is_admin : null,
    });

    if (error) {
      console.error('Error updating user:', error);
      return { error };
    }

    return { error: null };
  } catch (error) {
    console.error('Error in updateUser:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(userId: string): Promise<{ stats: UserStats | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { stats: null, error: null };
      }
      return { stats: null, error };
    }

    return { stats: data as UserStats, error: null };
  } catch (error) {
    return { stats: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Get user sessions
 */
export async function getUserSessions(userId: string, limit: number = 50): Promise<{ sessions: any[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { sessions: [], error };
    }

    return { sessions: data || [], error: null };
  } catch (error) {
    return { sessions: [], error: error instanceof Error ? error : new Error('Unknown error') };
  }
}


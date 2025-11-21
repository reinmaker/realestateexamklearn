import { supabase } from './authService';
import { QuizResult, AnalysisResult } from '../types';

export interface UserStats {
  quiz_count: number;
  exam_count: number;
  total_questions_answered: number;
  total_correct_answers: number;
  average_score: number;
  best_quiz_score: number;
  best_exam_score: number;
  last_quiz_date: string | null;
  last_exam_date: string | null;
}

export interface UserSession {
  id: string;
  session_type: 'quiz' | 'exam';
  questions: any[];
  results: QuizResult[];
  score: number;
  total_questions: number;
  percentage: number;
  completed_at: string;
}

/**
 * Save or update user statistics
 * @param isIncremental - If true, don't increment quiz_count/exam_count (for per-answer updates)
 */
export async function saveUserStats(
  userId: string,
  sessionType: 'quiz' | 'exam',
  score: number,
  totalQuestions: number,
  correctAnswers: number,
  isIncremental: boolean = false
): Promise<{ error: Error | null }> {
  try {
    // Get current stats or create new
    const { data: existingStats, error: fetchError } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is fine for new users
      console.error('Error fetching existing stats:', fetchError);
      return { error: fetchError };
    }

    const now = new Date().toISOString();
    const percentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

    if (existingStats) {
      // Update existing stats
      // Only increment quiz_count/exam_count if not incremental (i.e., on quiz completion)
      const newQuizCount = sessionType === 'quiz' && !isIncremental 
        ? (existingStats.quiz_count || 0) + 1 
        : (existingStats.quiz_count || 0);
      const newExamCount = sessionType === 'exam' && !isIncremental
        ? (existingStats.exam_count || 0) + 1 
        : (existingStats.exam_count || 0);
      
      // For incremental updates, SET the cumulative values (totalQuestions and correctAnswers are already cumulative)
      // For non-incremental updates, ADD to existing values (totalQuestions and correctAnswers are deltas)
      const newTotalQuestions = isIncremental
        ? totalQuestions // SET cumulative value
        : (existingStats.total_questions_answered || 0) + totalQuestions; // ADD delta
      const newTotalCorrect = isIncremental
        ? correctAnswers // SET cumulative value
        : (existingStats.total_correct_answers || 0) + correctAnswers; // ADD delta
      const newAverageScore = newTotalQuestions > 0 ? (newTotalCorrect / newTotalQuestions) * 100 : 0;
      const newBestQuizScore = sessionType === 'quiz' 
        ? Math.max(existingStats.best_quiz_score || 0, score)
        : (existingStats.best_quiz_score || 0);
      const newBestExamScore = sessionType === 'exam'
        ? Math.max(existingStats.best_exam_score || 0, score)
        : (existingStats.best_exam_score || 0);

      // First verify user is authenticated
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || authUser.id !== userId) {
        console.error('Authentication error: User not authenticated or user ID mismatch', {
          authUserId: authUser?.id,
          requestedUserId: userId
        });
        return { error: new Error('User not authenticated') };
      }

      // Update the stats - RLS policy now has with_check clause
      const { data: updatedData, error: updateError } = await supabase
        .from('user_stats')
        .update({
          quiz_count: newQuizCount,
          exam_count: newExamCount,
          total_questions_answered: newTotalQuestions,
          total_correct_answers: newTotalCorrect,
          average_score: newAverageScore,
          best_quiz_score: newBestQuizScore,
          best_exam_score: newBestExamScore,
          last_quiz_date: sessionType === 'quiz' ? now : existingStats.last_quiz_date,
          last_exam_date: sessionType === 'exam' ? now : existingStats.last_exam_date,
          updated_at: now,
        })
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateError) {
        console.error('Error updating stats:', updateError);
        console.error('Update error details:', {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint
        });
        return { error: updateError };
      }

      // Check if update returned data (some RLS policies may not return data on UPDATE)
      if (!updatedData) {
        console.warn('Update returned no data - verifying update succeeded by fetching stats');
        // Verify the update actually worked by fetching the stats
        const { data: verifyData, error: verifyError } = await supabase
          .from('user_stats')
          .select('*')
          .eq('user_id', userId)
          .single();
        
        if (verifyError) {
          console.error('Error verifying stats after update:', verifyError);
          return { error: new Error('Update may have failed - verification failed: ' + verifyError.message) };
        }
        
        // Check if the stats were actually updated
        const wasUpdated = verifyData.quiz_count === newQuizCount &&
                          verifyData.total_questions_answered === newTotalQuestions &&
                          verifyData.total_correct_answers === newTotalCorrect;
        
        if (wasUpdated) {
          return { error: null };
        } else {
          console.error('Update verification failed: Stats were not updated', {
            expected: { newQuizCount, newTotalQuestions, newTotalCorrect },
            actual: { 
              quiz_count: verifyData.quiz_count, 
              total_questions_answered: verifyData.total_questions_answered,
              total_correct_answers: verifyData.total_correct_answers
            }
          });
          return { error: new Error('Update failed - stats were not updated') };
        }
      }

      return { error: null };
    } else {
      // Create new stats
      const { data: insertedData, error: insertError } = await supabase
        .from('user_stats')
        .insert({
          user_id: userId,
          quiz_count: sessionType === 'quiz' ? 1 : 0,
          exam_count: sessionType === 'exam' ? 1 : 0,
          total_questions_answered: totalQuestions,
          total_correct_answers: correctAnswers,
          average_score: percentage,
          best_quiz_score: sessionType === 'quiz' ? score : 0,
          best_exam_score: sessionType === 'exam' ? score : 0,
          last_quiz_date: sessionType === 'quiz' ? now : null,
          last_exam_date: sessionType === 'exam' ? now : null,
        })
        .select();

      if (insertError) {
        console.error('Error inserting stats:', insertError);
        return { error: insertError };
      }

      return { error: null };
    }
  } catch (error) {
    console.error('Exception in saveUserStats:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error saving stats') };
  }
}

/**
 * Save user session (quiz or exam)
 */
export async function saveUserSession(
  userId: string,
  sessionType: 'quiz' | 'exam',
  questions: any[],
  results: QuizResult[],
  score: number
): Promise<{ error: Error | null }> {
  try {
    // Use questions.length as source of truth for total questions
    // results.length might not include all questions if quiz finished early
    const totalQuestions = questions && questions.length > 0 ? questions.length : results.length;
    // Handle both boolean and string/number formats for isCorrect
    const correctAnswers = results.filter(r => {
      const isCorrect = r?.isCorrect;
      // Check for boolean true, string "true", or 1
      return isCorrect === true || isCorrect === 'true' || isCorrect === 1 || isCorrect === '1';
    }).length;
    
    // Calculate percentage - prioritize score parameter if available
    let percentage = 0;
    if (score !== undefined && score !== null && totalQuestions > 0) {
      // Use score-based percentage as primary source (more reliable)
      percentage = (score / totalQuestions) * 100;
      console.log(`Saving session: Using score-based percentage: score=${score}, totalQuestions=${totalQuestions}, percentage=${percentage}%`);
    } else if (totalQuestions > 0) {
      // Fallback to results-based calculation
      percentage = (correctAnswers / totalQuestions) * 100;
      console.log(`Saving session: Using results-based percentage: correctAnswers=${correctAnswers}, totalQuestions=${totalQuestions}, percentage=${percentage}%`);
    }
    
    // Log warning if there's a significant mismatch (indicates data inconsistency)
    if (score !== undefined && score !== null && totalQuestions > 0) {
      const resultsBasedPercentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
      if (Math.abs(percentage - resultsBasedPercentage) > 5) {
        console.warn(`Percentage mismatch: results-based=${resultsBasedPercentage}%, score-based=${percentage}%. Using score-based.`);
      }
    }
    
    console.log(`Saving session: score=${score}, correctAnswers=${correctAnswers}, totalQuestions=${totalQuestions}, final percentage=${percentage}%`);

    const { error } = await supabase
      .from('user_sessions')
      .insert({
        user_id: userId,
        session_type: sessionType,
        questions: questions,
        results: results,
        score: score,
        total_questions: totalQuestions,
        percentage: percentage,
      });

    if (error) {
      console.error('Error saving user session:', error);
    }

    return { error: error || null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unknown error saving session') };
  }
}

/**
 * Save user analysis
 */
export async function saveUserAnalysis(
  userId: string,
  analysis: AnalysisResult,
  quizHistory: QuizResult[],
  examHistory: QuizResult[]
): Promise<{ error: Error | null }> {
  try {
    const totalHistory = [...quizHistory, ...examHistory];
    const totalQuestions = totalHistory.length;
    const correctAnswers = totalHistory.filter(r => r.isCorrect).length;
    const scorePercentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

    const { error } = await supabase
      .from('user_analysis')
      .insert({
        user_id: userId,
        analysis_data: {
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
          recommendations: analysis.recommendations,
        },
        quiz_history: quizHistory,
        exam_history: examHistory,
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        score_percentage: scorePercentage,
      });

    return { error: error || null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unknown error saving analysis') };
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
        // Not found - return null stats (new user)
        return { stats: null, error: null };
      }
      return { stats: null, error };
    }

    return { stats: data as UserStats, error: null };
  } catch (error) {
    return { stats: null, error: error instanceof Error ? error : new Error('Unknown error getting stats') };
  }
}

/**
 * Get user sessions (recent quizzes/exams)
 */
export async function getUserSessions(
  userId: string,
  limit: number = 10
): Promise<{ sessions: UserSession[]; error: Error | null }> {
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

    return { sessions: (data || []) as UserSession[], error: null };
  } catch (error) {
    return { sessions: [], error: error instanceof Error ? error : new Error('Unknown error getting sessions') };
  }
}

/**
 * Get latest user analysis with history
 */
export async function getLatestUserAnalysis(
  userId: string
): Promise<{ 
  analysis: AnalysisResult | null; 
  quizHistory: QuizResult[]; 
  examHistory: QuizResult[];
  error: Error | null 
}> {
  try {
    const { data, error } = await supabase
      .from('user_analysis')
      .select('analysis_data, quiz_history, exam_history')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return { analysis: null, quizHistory: [], examHistory: [], error: null };
      }
      return { analysis: null, quizHistory: [], examHistory: [], error };
    }

    if (!data) {
      return { analysis: null, quizHistory: [], examHistory: [], error: null };
    }

    const analysis: AnalysisResult = {
      strengths: data.analysis_data?.strengths || [],
      weaknesses: data.analysis_data?.weaknesses || [],
      recommendations: data.analysis_data?.recommendations || '',
    };

    // Parse history arrays - ensure they're arrays and have correct structure
    let quizHistory: QuizResult[] = [];
    let examHistory: QuizResult[] = [];
    
    if (data.quiz_history) {
      if (Array.isArray(data.quiz_history)) {
        // Normalize the data - ensure isCorrect is a boolean
        quizHistory = data.quiz_history.map((item: any) => ({
          question: item.question || '',
          isCorrect: item.isCorrect === true || item.isCorrect === 'true' || item.isCorrect === 1 || item.isCorrect === '1',
          explanation: item.explanation || '',
          topic: item.topic || undefined
        })) as QuizResult[];
      } else if (typeof data.quiz_history === 'string') {
        try {
          const parsed = JSON.parse(data.quiz_history);
          if (Array.isArray(parsed)) {
            quizHistory = parsed.map((item: any) => ({
              question: item.question || '',
              isCorrect: item.isCorrect === true || item.isCorrect === 'true' || item.isCorrect === 1 || item.isCorrect === '1',
              explanation: item.explanation || '',
              topic: item.topic || undefined
            })) as QuizResult[];
          }
        } catch (e) {
          console.error('Error parsing quiz_history:', e);
        }
      }
    }
    
    if (data.exam_history) {
      if (Array.isArray(data.exam_history)) {
        // Normalize the data - ensure isCorrect is a boolean
        examHistory = data.exam_history.map((item: any) => ({
          question: item.question || '',
          isCorrect: item.isCorrect === true || item.isCorrect === 'true' || item.isCorrect === 1 || item.isCorrect === '1',
          explanation: item.explanation || '',
          topic: item.topic || undefined
        })) as QuizResult[];
      } else if (typeof data.exam_history === 'string') {
        try {
          const parsed = JSON.parse(data.exam_history);
          if (Array.isArray(parsed)) {
            examHistory = parsed.map((item: any) => ({
              question: item.question || '',
              isCorrect: item.isCorrect === true || item.isCorrect === 'true' || item.isCorrect === 1 || item.isCorrect === '1',
              explanation: item.explanation || '',
              topic: item.topic || undefined
            })) as QuizResult[];
          }
        } catch (e) {
          console.error('Error parsing exam_history:', e);
        }
      }
    }

    return { 
      analysis, 
      quizHistory,
      examHistory,
      error: null 
    };
  } catch (error) {
    return { 
      analysis: null, 
      quizHistory: [], 
      examHistory: [], 
      error: error instanceof Error ? error : new Error('Unknown error getting analysis') 
    };
  }
}


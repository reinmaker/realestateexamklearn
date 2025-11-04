import { QuizQuestion } from '../types';
import { generateQuiz, determineAnswerAndExplanation } from './aiService';
import { supabase } from './authService';

interface DbQuestion {
  id: string;
  question_number: number;
  question_text: string;
  answer?: string;
  explanation?: string;
  options?: string[]; // Array of 4 options if available
}

/**
 * Fetches questions from Supabase database
 */
export async function fetchQuestionsFromDB(count: number): Promise<DbQuestion[]> {
  try {
    // Fetch ALL questions with options from the database to maximize variety
    // This ensures we use the full pool of 730+ questions
    const { data: allData, error: fetchError } = await supabase
      .from('questions')
      .select('id, question_number, question_text, answer, explanation, options')
      .not('options', 'is', null); // Only get questions with options
      // No limit - fetch all questions for maximum variety

    if (fetchError) {
      console.error('Error fetching questions from DB:', fetchError);
      throw fetchError;
    }

    if (!allData || allData.length === 0) {
      console.warn('No questions found in database');
      return [];
    }

    console.log(`Fetched ${allData.length} total questions from DB`);

    // Shuffle all fetched questions using Fisher-Yates algorithm for better randomness
    const shuffled = [...allData];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Select the requested count from the shuffled pool
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    
    console.log(`Selected ${selected.length} random questions from ${allData.length} total questions`);
    
    return selected;
  } catch (error) {
    console.error('Failed to fetch questions from database:', error);
    return [];
  }
}

/**
 * Fetches all questions that need answers computed (have options but no answer/explanation)
 */
export async function fetchQuestionsNeedingAnswers(): Promise<DbQuestion[]> {
  try {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question_number, question_text, answer, explanation, options')
      .not('options', 'is', null)
      .or('answer.is.null,explanation.is.null')
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Error fetching questions needing answers:', error);
      throw error;
    }

    // Filter to only questions with 4 options
    return (data || []).filter(q => q.options && Array.isArray(q.options) && q.options.length === 4);
  } catch (error) {
    console.error('Failed to fetch questions needing answers:', error);
    return [];
  }
}

/**
 * Converts DB questions to QuizQuestion format
 * If questions have options, only determines answer and explanation (fast)
 * If questions don't have options, generates full question (slower)
 */
export async function convertDbQuestionsToQuizFormat(
  dbQuestions: DbQuestion[],
  documentContent: string
): Promise<QuizQuestion[]> {
  if (dbQuestions.length === 0) {
    return [];
  }

  try {
    const quizQuestions: QuizQuestion[] = [];

    // Process questions with options (fast path - only determine answer)
    const questionsWithOptions = dbQuestions.filter(q => q.options && Array.isArray(q.options) && q.options.length === 4);
    
    // Process questions without options (slow path - full AI generation)
    const questionsWithoutOptions = dbQuestions.filter(q => !q.options || !Array.isArray(q.options) || q.options.length !== 4);

    // Fast path: Questions with options - only determine answer and explanation
    for (const dbQuestion of questionsWithOptions) {
      try {
        const result = await determineAnswerAndExplanation(
          dbQuestion.question_text,
          dbQuestion.options!,
          documentContent
        );

        quizQuestions.push({
          question: dbQuestion.question_text,
          options: dbQuestion.options!,
          correctAnswerIndex: result.correctAnswerIndex,
          explanation: result.explanation
        });
      } catch (error) {
        console.error(`Error processing question ${dbQuestion.question_number}:`, error);
        // Skip this question if conversion fails
      }
    }

    // Slow path: Questions without options - full AI generation
    if (questionsWithoutOptions.length > 0) {
      const questionsText = questionsWithoutOptions
        .map((q, idx) => `${idx + 1}. ${q.question_text}`)
        .join('\n\n');

      const combinedContext = `${documentContent}\n\nשאלות מהמאגר להמרה:\n${questionsText}`;
      const generatedQuestions = await generateQuiz(combinedContext, questionsWithoutOptions.length);
      
      quizQuestions.push(...generatedQuestions);
    }

    return quizQuestions;
  } catch (error) {
    console.error('Error converting DB questions to quiz format:', error);
    return [];
  }
}

/**
 * Fetches questions from DB and converts them to quiz format one by one
 * Returns questions progressively for immediate display - shows each question as soon as it's ready
 */
export async function getDbQuestionsAsQuiz(
  count: number,
  documentContent: string,
  onProgress?: (questions: QuizQuestion[]) => void
): Promise<QuizQuestion[]> {
  try {
    // Fetch questions from DB immediately (fast)
    // fetchQuestionsFromDB now handles randomization, so we get a random set
    const dbQuestions = await fetchQuestionsFromDB(count);
    
    if (dbQuestions.length === 0) {
      console.warn('No questions found in database');
      return [];
    }

    // Questions are already randomized by fetchQuestionsFromDB, so use them directly
    const selected = dbQuestions;

    // Convert one by one - prioritize questions with options (faster)
    const allQuizQuestions: QuizQuestion[] = [];
    
    // Separate questions with and without options
    const questionsWithOptions = selected.filter(q => q.options && Array.isArray(q.options) && q.options.length === 4);
    const questionsWithoutOptions = selected.filter(q => !q.options || !Array.isArray(q.options) || q.options.length !== 4);
    
    // Process questions with options first (fast path - use pre-computed answers if available)
    for (const dbQuestion of questionsWithOptions) {
      try {
        let convertedQuestion: QuizQuestion;
        let correctAnswerText: string;
        let shuffledOptions: string[];
        let correctAnswerIndex: number;

        // Check if answer and explanation are already pre-computed
        if (dbQuestion.answer && dbQuestion.explanation) {
          // Check if answer is stored as an index (number as string) or as text
          const answerIndex = parseInt(dbQuestion.answer, 10);
          
          if (!isNaN(answerIndex) && answerIndex >= 0 && answerIndex < dbQuestion.options!.length) {
            // Answer is stored as an index (0-3), convert to text - NO API CALL NEEDED
            correctAnswerText = dbQuestion.options![answerIndex];
          } else {
            // Answer is stored as text, use it directly - NO API CALL NEEDED
            correctAnswerText = dbQuestion.answer;
            
            // Only validate if answer text doesn't exist in options (don't recompute unnecessarily)
            // If the answer text doesn't match exactly, it might still be valid (e.g., slight formatting differences)
            // We'll only skip if it's completely invalid
            if (!dbQuestion.options!.some(opt => opt.trim() === correctAnswerText.trim() || opt.includes(correctAnswerText) || correctAnswerText.includes(opt))) {
              // Answer text is completely invalid - skip this question rather than making API call
              console.warn(`Invalid pre-computed answer for question ${dbQuestion.question_number}, skipping API call to avoid unnecessary requests`);
              // Use first option as fallback instead of making API call
              correctAnswerText = dbQuestion.options![0];
            }
          }
        } else {
          // Missing answer/explanation - skip this question to avoid API calls
          // We should pre-compute answers for all questions in the DB
          console.warn(`Question ${dbQuestion.question_number} missing answer/explanation, skipping to avoid API call`);
          // Skip this question entirely - don't add it to the quiz
          continue;
        }

        // Randomize the order of options
        shuffledOptions = [...dbQuestion.options!].sort(() => Math.random() - 0.5);
        
        // Find the index of the correct answer in the shuffled options
        correctAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
        
        if (correctAnswerIndex === -1) {
          // This shouldn't happen, but handle it gracefully
          console.error(`Could not find correct answer in shuffled options for question ${dbQuestion.question_number}`);
          correctAnswerIndex = 0; // Fallback
        }

        convertedQuestion = {
          question: dbQuestion.question_text,
          options: shuffledOptions,
          correctAnswerIndex: correctAnswerIndex,
          explanation: dbQuestion.explanation || '' // Use existing explanation if available
        };

        allQuizQuestions.push(convertedQuestion);
        
        // Show question immediately as soon as it's converted
        if (onProgress) {
          onProgress([...allQuizQuestions]);
        }
      } catch (error) {
        console.error(`Error processing question ${dbQuestion.question_number}:`, error);
        // Skip this question if conversion fails
      }
    }
    
    // Process questions without options - batch them all in one API call
    if (questionsWithoutOptions.length > 0) {
      try {
        // Generate all questions without options in a single API call
        const questionsText = questionsWithoutOptions
          .map((q, idx) => `${idx + 1}. ${q.question_text}`)
          .join('\n\n');
        const combinedContext = `${documentContent}\n\nשאלות מהמאגר להמרה:\n${questionsText}`;
        const generatedQuestions = await generateQuiz(combinedContext, questionsWithoutOptions.length);
        
        // Process each generated question
        for (let i = 0; i < generatedQuestions.length && i < questionsWithoutOptions.length; i++) {
          const generatedQuestion = generatedQuestions[i];
          
          // Randomize options for AI-generated questions
          const correctAnswerText = generatedQuestion.options[generatedQuestion.correctAnswerIndex];
          const shuffledOptions = [...generatedQuestion.options].sort(() => Math.random() - 0.5);
          const correctAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
          
          const randomizedQuestion: QuizQuestion = {
            question: generatedQuestion.question,
            options: shuffledOptions,
            correctAnswerIndex: correctAnswerIndex !== -1 ? correctAnswerIndex : 0,
            explanation: generatedQuestion.explanation
          };
          
          allQuizQuestions.push(randomizedQuestion);
        }
        
        // Show all questions at once after batch generation
        if (onProgress && questionsWithoutOptions.length > 0) {
          onProgress([...allQuizQuestions]);
        }
      } catch (error) {
        console.error(`Error processing questions without options:`, error);
        // Skip questions if batch conversion fails
      }
    }
    
    return allQuizQuestions;
  } catch (error) {
    console.error('Error getting DB questions as quiz:', error);
    return [];
  }
}

/**
 * Gets questions from DB and uses them as context for AI generation
 * This creates multiple-choice questions based on the DB question topics
 * @deprecated Use getDbQuestionsAsQuiz instead for immediate display
 */
export async function getRandomQuestionsFromDB(
  count: number,
  documentContent: string
): Promise<QuizQuestion[]> {
  return await getDbQuestionsAsQuiz(count, documentContent);
}


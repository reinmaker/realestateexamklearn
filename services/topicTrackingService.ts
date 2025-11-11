import { QuizResult, QuizQuestion } from '../types';
import { supabase } from './authService';
import { getOpenAIKey, getGeminiKey } from './apiKeysService';

export interface TopicProgress {
  topic: string;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  accuracy: number; // percentage
}

export interface QuestionTopic {
  question: string;
  topic: string;
}

/**
 * Use AI to categorize a question into a topic
 */
export async function categorizeQuestionByTopic(
  question: string,
  documentContent: string
): Promise<string> {
  // Import OpenAI and Gemini clients
  const OpenAI = (await import('openai')).default;
  const { GoogleGenAI } = await import('@google/genai');
  
  // Use OpenAI first, fallback to Gemini
  try {
    // Try to get API key from Supabase secrets first, fallback to env
    let openaiApiKey: string;
    try {
      openaiApiKey = await getOpenAIKey();
    } catch (error) {
      // Fallback to environment variable
      openaiApiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || '';
      if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY not configured');
      }
    }
    const openai = new OpenAI({ 
      apiKey: openaiApiKey,
      dangerouslyAllowBrowser: true 
    });
    const openAIModel = 'gpt-4o-mini';
    
    const prompt = `אתה מומחה במבחן הרישוי למתווכי מקרקעין בישראל. קטלג את השאלה הבאה לנושא אחד ספציפי (כמו: "דמי תיווך", "הערת אזהרה", "בלעדיות", "זכויות מתווך", "חובות מתווך", "הסכמים", "רישוי", וכו').

שאלה: ${question}

חומר הלימוד:
---
${documentContent}
---

השב בשם הנושא בלבד, ללא הסברים. השם צריך להיות קצר ומדויק (2-4 מילים).`;

    const response = await openai.responses.create({
      model: openAIModel,
      instructions: 'אתה מערכת קטלוג שאלות. אתה תמיד מחזיר רק את שם הנושא, ללא הסברים או טקסט נוסף.',
      input: prompt,
      temperature: 0.3,
    });

    const topic = response.output_text?.trim();
    if (!topic) {
      throw new Error('No topic returned');
    }
    return topic;
  } catch (error) {
    // Fallback to Gemini
    let geminiApiKey: string;
    try {
      geminiApiKey = await getGeminiKey();
    } catch (error) {
      // Fallback to environment variable
      geminiApiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || '';
      if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY not configured');
      }
    }
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const geminiModel = 'gemini-2.5-flash';
    
    const prompt = `אתה מומחה במבחן הרישוי למתווכי מקרקעין בישראל. קטלג את השאלה הבאה לנושא אחד ספציפי (כמו: "דמי תיווך", "הערת אזהרה", "בלעדיות", "זכויות מתווך", "חובות מתווך", "הסכמים", "רישוי", וכו').

שאלה: ${question}

חומר הלימוד:
---
${documentContent}
---

השב בשם הנושא בלבד, ללא הסברים. השם צריך להיות קצר ומדויק (2-4 מילים).`;

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: prompt,
    });

    return response.text.trim();
  }
}

/**
 * Categorize multiple questions by topic (batch) - single API call
 */
export async function categorizeQuestionsByTopic(
  questions: string[],
  documentContent: string
): Promise<QuestionTopic[]> {
  if (questions.length === 0) {
    return [];
  }
  
  // Import OpenAI and Gemini clients
  const OpenAI = (await import('openai')).default;
  const { GoogleGenAI, Type } = await import('@google/genai');
  
  // Use OpenAI first, fallback to Gemini - single API call for all questions
  try {
    // Try to get API key from Supabase secrets first, fallback to env
    let openaiApiKey: string;
    try {
      openaiApiKey = await getOpenAIKey();
    } catch (error) {
      // Fallback to environment variable
      openaiApiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || '';
      if (!openaiApiKey) {
        throw new Error('OPENAI_API_KEY not configured');
      }
    }
    const openai = new OpenAI({ 
      apiKey: openaiApiKey,
      dangerouslyAllowBrowser: true 
    });
    const openAIModel = 'gpt-4o-mini';
    
    const questionsText = questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n\n');
    const prompt = `אתה מומחה במבחן הרישוי למתווכי מקרקעין בישראל. קטלג את כל השאלות הבאות לנושאים ספציפיים (כמו: "דמי תיווך", "הערת אזהרה", "בלעדיות", "זכויות מתווך", "חובות מתווך", "הסכמים", "רישוי", וכו').

שאלות:
${questionsText}

חומר הלימוד:
---
${documentContent}
---

השב ב-JSON עם מבנה:
{
  "questions": [
    {"question": "שאלה 1", "topic": "נושא"},
    {"question": "שאלה 2", "topic": "נושא"},
    ...
  ]
}

כל נושא צריך להיות קצר ומדויק (2-4 מילים).`;

    const response = await openai.responses.create({
      model: openAIModel,
      instructions: 'אתה מערכת קטלוג שאלות. אתה תמיד מחזיר JSON עם רשימת שאלות ונושאים. השב עם אובייקט JSON שמכיל שדה "questions" שהוא מערך של אובייקטים עם "question" ו-"topic".',
      input: prompt,
      temperature: 0.3,
      text: {
        format: {
          type: 'json_object'
        }
      }
    });

    const content = response.output_text?.trim();
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(content);
      // Handle both {questions: [...]} and direct array
      const questionsArray = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.results || []);
      
      // Map to QuestionTopic format - match by index if array length matches
      const questionTopics: QuestionTopic[] = questions.map((q, idx) => {
        // Try to find by exact question match first
        let found = questionsArray.find((item: any) => 
          item.question === q || 
          item.question?.includes(q.substring(0, 50)) ||
          q.includes(item.question?.substring(0, 50) || '')
        );
        
        // If not found and array length matches, use index
        if (!found && questionsArray.length === questions.length && questionsArray[idx]) {
          found = questionsArray[idx];
        }
        
        // Try finding by index/number fields
        if (!found) {
          found = questionsArray.find((item: any) => 
            item.index === idx + 1 ||
            item.number === idx + 1 ||
            item.id === idx + 1
          );
        }
        
        return {
          question: q,
          topic: found?.topic || 'נושא כללי'
        };
      });
      
      return questionTopics;
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      throw new Error('Failed to parse response');
    }
  } catch (error) {
    // Fallback to Gemini
    try {
      let geminiApiKey: string;
      try {
        geminiApiKey = await getGeminiKey();
      } catch (error) {
        // Fallback to environment variable
        geminiApiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || '';
        if (!geminiApiKey) {
          throw new Error('GEMINI_API_KEY not configured');
        }
      }
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const geminiModel = 'gemini-2.5-flash';
      
      const questionsText = questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n\n');
      const prompt = `אתה מומחה במבחן הרישוי למתווכי מקרקעין בישראל. קטלג את כל השאלות הבאות לנושאים ספציפיים (כמו: "דמי תיווך", "הערת אזהרה", "בלעדיות", "זכויות מתווך", "חובות מתווך", "הסכמים", "רישוי", וכו').

שאלות:
${questionsText}

חומר הלימוד:
---
${documentContent}
---

השב ב-JSON עם מבנה:
[
  {"question": "שאלה 1", "topic": "נושא"},
  {"question": "שאלה 2", "topic": "נושא"},
  ...
]

כל נושא צריך להיות קצר ומדויק (2-4 מילים).`;

      const answerSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING, description: "השאלה" },
            topic: { type: Type.STRING, description: "הנושא" }
          },
          required: ["question", "topic"]
        }
      };

      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: answerSchema,
        },
      });

      const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleanedText);
      
      // Map to QuestionTopic format
      const questionTopics: QuestionTopic[] = questions.map((q) => {
        const found = Array.isArray(parsed) 
          ? parsed.find((item: any) => item.question === q || item.question?.includes(q.substring(0, 50)))
          : null;
        return {
          question: q,
          topic: found?.topic || 'נושא כללי'
        };
      });
      
      return questionTopics;
    } catch (geminiError) {
      console.error('Error categorizing questions with Gemini:', geminiError);
      // Fallback: return default topic for all questions
      return questions.map(q => ({ question: q, topic: 'נושא כללי' }));
    }
  }
}

/**
 * Calculate topic progress from quiz results
 */
export function calculateTopicProgress(
  results: QuizResult[],
  questionTopics: QuestionTopic[]
): Map<string, TopicProgress> {
  const topicMap = new Map<string, TopicProgress>();
  
  // Initialize topics from question topics
  for (const qt of questionTopics) {
    if (!topicMap.has(qt.topic)) {
      topicMap.set(qt.topic, {
        topic: qt.topic,
        totalQuestions: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        accuracy: 0,
      });
    }
  }
  
  // Calculate progress from results
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const questionTopic = questionTopics.find(qt => qt.question === result.question);
    
    if (questionTopic) {
      const progress = topicMap.get(questionTopic.topic);
      if (progress) {
        progress.totalQuestions++;
        if (result.isCorrect) {
          progress.correctAnswers++;
        } else {
          progress.incorrectAnswers++;
        }
        progress.accuracy = progress.totalQuestions > 0 
          ? (progress.correctAnswers / progress.totalQuestions) * 100 
          : 0;
      }
    }
  }
  
  return topicMap;
}

/**
 * Get weak and strong topics from progress
 */
export function getWeakAndStrongTopics(
  topicProgress: Map<string, TopicProgress>
): { weakTopics: string[]; strongTopics: string[] } {
  const topics = Array.from(topicProgress.values());
  
  // Sort by accuracy (ascending - worst first)
  const sortedTopics = topics.sort((a, b) => a.accuracy - b.accuracy);
  
  // Weak topics: accuracy < 70% or topics with more incorrect than correct
  const weakTopics = sortedTopics
    .filter(t => t.accuracy < 70 || t.incorrectAnswers > t.correctAnswers)
    .map(t => t.topic);
  
  // Strong topics: accuracy >= 70% and more correct than incorrect
  const strongTopics = sortedTopics
    .filter(t => t.accuracy >= 70 && t.correctAnswers >= t.incorrectAnswers)
    .map(t => t.topic);
  
  return { weakTopics, strongTopics };
}

/**
 * Save topic progress to database
 */
export async function saveTopicProgress(
  userId: string,
  topicProgress: Map<string, TopicProgress>
): Promise<{ error: Error | null }> {
  try {
    const topics = Array.from(topicProgress.values());
    
    if (topics.length === 0) {
      return { error: null };
    }
    
    // Prepare data for batch upsert
    const progressData = topics.map(topic => ({
      user_id: userId,
      topic: topic.topic,
      total_questions: topic.totalQuestions,
      correct_answers: topic.correctAnswers,
      incorrect_answers: topic.incorrectAnswers,
      accuracy: topic.accuracy,
      updated_at: new Date().toISOString(),
    }));
    
    // Batch upsert all topics at once (single call instead of N+1 calls)
    // onConflict uses the unique constraint on (user_id, topic)
    const { error } = await supabase
      .from('user_topic_progress')
      .upsert(progressData, {
        onConflict: 'user_id,topic',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error('Error saving topic progress:', error);
      return { error };
    }
    
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unknown error saving topic progress') };
  }
}

/**
 * Get topic progress from database
 */
export async function getTopicProgress(
  userId: string
): Promise<{ topicProgress: Map<string, TopicProgress>; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('user_topic_progress')
      .select('*')
      .eq('user_id', userId);
    
    if (error) {
      return { topicProgress: new Map(), error };
    }
    
    const topicProgress = new Map<string, TopicProgress>();
    
    if (data) {
      for (const row of data) {
        topicProgress.set(row.topic, {
          topic: row.topic,
          totalQuestions: row.total_questions || 0,
          correctAnswers: row.correct_answers || 0,
          incorrectAnswers: row.incorrect_answers || 0,
          accuracy: row.accuracy || 0,
        });
      }
    }
    
    return { topicProgress, error: null };
  } catch (error) {
    return { 
      topicProgress: new Map(), 
      error: error instanceof Error ? error : new Error('Unknown error getting topic progress') 
    };
  }
}


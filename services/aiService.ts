import OpenAI from 'openai';
import { GoogleGenAI, Type, GenerateContentResponse, Chat, Modality } from "@google/genai";
import { QuizQuestion, Flashcard, ChatMessage, QuizResult, AnalysisResult } from '../types';
import { getOpenAIKey, getGeminiKey } from './apiKeysService';

// Cache for OpenAI client to avoid recreating it
let openAIClient: OpenAI | null = null;
let openAIKey: string | null = null;

// Cache for Gemini client to avoid recreating it
let geminiClient: GoogleGenAI | null = null;
let geminiKey: string | null = null;

// Initialize OpenAI client
const getOpenAI = async (): Promise<OpenAI> => {
  try {
    // Try to get API key from Supabase secrets first
    const apiKey = await getOpenAIKey();
    
    // If apiKey is null, Edge Function is unavailable, fall through to env
    if (!apiKey) {
      throw new Error('EDGE_FUNCTION_UNAVAILABLE');
    }
    
    // If key changed, recreate client
    if (!openAIClient || openAIKey !== apiKey) {
      openAIKey = apiKey;
      openAIClient = new OpenAI({ 
        apiKey,
        dangerouslyAllowBrowser: true 
      });
    }
    
    return openAIClient;
  } catch (error) {
    // Fallback to environment variable if Supabase fetch fails
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes('EDGE_FUNCTION_UNAVAILABLE')) {
      console.warn('Failed to fetch OpenAI key from Supabase, falling back to env:', error);
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured in Supabase secrets or environment variables');
    }
    
    if (!openAIClient || openAIKey !== apiKey) {
      openAIKey = apiKey;
      openAIClient = new OpenAI({ 
        apiKey,
        dangerouslyAllowBrowser: true 
      });
    }
    
    return openAIClient;
  }
};

// Initialize Gemini client
const getGemini = async (): Promise<GoogleGenAI> => {
  try {
    // Try to get API key from Supabase secrets first
    const apiKey = await getGeminiKey();
    
    // If apiKey is null, Edge Function is unavailable, fall through to env
    if (!apiKey) {
      throw new Error('EDGE_FUNCTION_UNAVAILABLE');
    }
    
    // If key changed, recreate client
    if (!geminiClient || geminiKey !== apiKey) {
      geminiKey = apiKey;
      geminiClient = new GoogleGenAI({ apiKey });
    }
    
    return geminiClient;
  } catch (error) {
    // Fallback to environment variable if Supabase fetch fails
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes('EDGE_FUNCTION_UNAVAILABLE')) {
      console.warn('Failed to fetch Gemini key from Supabase, falling back to env:', error);
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in Supabase secrets or environment variables');
    }
    
    if (!geminiClient || geminiKey !== apiKey) {
      geminiKey = apiKey;
      geminiClient = new GoogleGenAI({ apiKey });
    }
    
    return geminiClient;
  }
};

const geminiModel = 'gemini-2.5-flash';
const openAIModel = 'gpt-4o-mini'; // Using gpt-4o-mini for cost efficiency

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a retryable error
      const isRetryableError = 
        error?.status === 503 || 
        error?.status === 429 ||
        error?.message?.includes('overloaded') ||
        error?.message?.includes('rate limit') ||
        error?.code === 'rate_limit_exceeded';
      
      if (!isRetryableError || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Helper to try OpenAI first, then fallback to Gemini
async function tryWithFallback<T>(
  openAIFn: () => Promise<T>,
  geminiFn: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    // Try OpenAI first
    return await openAIFn();
  } catch (openAIError: any) {
    const errorMsg = openAIError?.message || String(openAIError) || '';
    console.warn('OpenAI request failed, falling back to Gemini:', errorMsg);
    
    // Check if it's a browser environment error or other non-retryable error
    const isBrowserError = errorMsg.includes('browser-like environment') || 
                           errorMsg.includes('browser environment') ||
                           errorMsg.includes('dangerouslyAllowBrowser');
    
    // If it's a browser error, skip retry and go straight to fallback
    if (isBrowserError) {
      console.log('OpenAI browser error detected, skipping retry and using Gemini fallback');
    }
    
    // Always fallback to Gemini (it will retry internally if needed)
    try {
      console.log('Attempting Gemini fallback...');
      return await retryWithBackoff(geminiFn);
    } catch (geminiError: any) {
      console.error('Both OpenAI and Gemini failed:', { 
        openAIError: errorMsg, 
        geminiError: geminiError?.message || geminiError 
      });
      // If Gemini also fails, throw a user-friendly error
      throw new Error(errorMessage);
    }
  }
}

// Quiz generation with OpenAI
async function generateQuizOpenAI(documentContent: string, count: number): Promise<QuizQuestion[]> {
  const openai = await getOpenAI();
  
  const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא ליצור סט חדש של בדיוק ${count} שאלות ייחודיות בפורמט מבחן אמריקאי. השאלות צריכות להיות דומות בסגנון ובדרגת קושי למבחנים קודמים שמופיעים במסמך המצורף. השאלות החדשות צריכות לבחון את אותם עקרונות משפטיים מרכזיים אך להציג אותם בתרחישים חדשים. לכל שאלה, ספק ארבע אפשרויות תשובה, את האינדקס של התשובה הנכונה, והסבר קצר במיוחד, בן משפט אחד בלבד. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חשוב ביותר: חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (כלומר, ללא כוכביות **). אל תעתיק או תנסח מחדש שאלות מהמסמך שסופק. כל התוכן חייב להיות בעברית.

המסמך המכיל מבחנים קודמים הוא:
---
${documentContent}
---

השב ב-JSON בלבד בפורמט הבא:
[
  {
    "question": "שאלה",
    "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
    "correctAnswerIndex": 0,
    "explanation": "הסבר קצר"
  }
]`;

  const response = await openai.chat.completions.create({
    model: openAIModel,
    messages: [
      { 
        role: 'system', 
        content: 'אתה עוזר מומחה ביצירת שאלות למבחן. אתה תמיד מחזיר JSON בפורמט הבא: {"questions": [{"question": "...", "options": ["...", "..."], "correctAnswerIndex": 0, "explanation": "..."}]} ללא טקסט נוסף.' 
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9, // Higher temperature for more variety in flashcards
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse JSON response
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  // Handle both array and object with questions array
  const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);
  
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Invalid response format from OpenAI - no questions found');
  }

  // Randomize options for each question
  return questions.map(q => {
    const correctAnswerText = q.options[q.correctAnswerIndex];
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
    const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
    
    return {
      ...q,
      options: shuffledOptions,
      correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0
    };
  });
}

// Quiz generation with Gemini (fallback)
async function generateQuizGemini(documentContent: string, count: number): Promise<QuizQuestion[]> {
  const ai = await getGemini();
  
  const quizSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswerIndex: { type: Type.INTEGER },
        explanation: { type: Type.STRING },
      },
      required: ["question", "options", "correctAnswerIndex", "explanation"],
    },
  };

  const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא ליצור סט חדש של בדיוק ${count} שאלות ייחודיות בפורמט מבחן אמריקאי. השאלות צריכות להיות דומות בסגנון ובדרגת קושי למבחנים קודמים שמופיעים במסמך המצורף. השאלות החדשות צריכות לבחון את אותם עקרונות משפטיים מרכזיים אך להציג אותם בתרחישים חדשים. לכל שאלה, ספק ארבע אפשרויות תשובה, את האינדקס של התשובה הנכונה, והסבר קצר במיוחד, בן משפט אחד בלבד. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חשוב ביותר: חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (כלומר, ללא כוכביות **). אל תעתיק או תנסח מחדש שאלות מהמסמך שסופק. כל התוכן חייב להיות בעברית.

המסמך המכיל מבחנים קודמים הוא:
---
${documentContent}
---`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: quizSchema,
    },
  });
  
  const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
  const questions = JSON.parse(cleanedText) as QuizQuestion[];
  
  if (!Array.isArray(questions)) {
    throw new Error("AI response is not a JSON array.");
  }
  
  // Randomize options for AI-generated questions
  return questions.map(q => {
    const correctAnswerText = q.options[q.correctAnswerIndex];
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
    const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
    
    return {
      ...q,
      options: shuffledOptions,
      correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0
    };
  });
}

export async function generateQuiz(documentContent: string, count: number): Promise<QuizQuestion[]> {
  return tryWithFallback(
    () => generateQuizOpenAI(documentContent, count),
    () => generateQuizGemini(documentContent, count),
    "נכשל ביצירת שאלות הבוחן."
  );
}

// Answer determination with OpenAI
async function determineAnswerAndExplanationOpenAI(
  question: string,
  options: string[],
  documentContent: string
): Promise<{ correctAnswerIndex: number; explanation: string }> {
  try {
    const openai = await getOpenAI();
    
    const prompt = `אתה מומחה במבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא לקבוע את התשובה הנכונה לשאלה ולהסביר מדוע.

השאלה:
${question}

האפשרויות:
${options.map((opt, idx) => `${idx}. ${opt}`).join('\n')}

חומר הלימוד:
---
${documentContent}
---

קבע את התשובה הנכונה (0-3) והסבר קצר (משפט אחד) מדוע זו התשובה הנכונה. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו (ללא **). כל התוכן בעברית.

השב ב-JSON בלבד:
{
  "correctAnswerIndex": 0,
  "explanation": "הסבר קצר"
}`;

    const response = await openai.chat.completions.create({
      model: openAIModel,
      messages: [
        { role: 'system', content: 'אתה עוזר מומחה. אתה תמיד מחזיר JSON בלבד, ללא טקסט נוסף.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    let result: any;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Invalid JSON response from OpenAI');
      }
    }
    
    if (result.correctAnswerIndex < 0 || result.correctAnswerIndex >= options.length) {
      throw new Error(`Invalid answer index: ${result.correctAnswerIndex}`);
    }

    return {
      correctAnswerIndex: result.correctAnswerIndex,
      explanation: result.explanation
    };
  } catch (error: any) {
    // Log the error for debugging
    console.error('OpenAI determineAnswerAndExplanation error:', error);
    throw error;
  }
}

// Answer determination with Gemini (fallback)
async function determineAnswerAndExplanationGemini(
  question: string,
  options: string[],
  documentContent: string
): Promise<{ correctAnswerIndex: number; explanation: string }> {
  const ai = await getGemini();
  
  const answerSchema = {
    type: Type.OBJECT,
    properties: {
      correctAnswerIndex: { type: Type.INTEGER, description: "האינדקס של התשובה הנכונה (0-3)" },
      explanation: { type: Type.STRING, description: "הסבר קצר מדוע זו התשובה הנכונה" }
    },
    required: ["correctAnswerIndex", "explanation"]
  };

  const prompt = `אתה מומחה במבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא לקבוע את התשובה הנכונה לשאלה ולהסביר מדוע.

השאלה:
${question}

האפשרויות:
${options.map((opt, idx) => `${idx}. ${opt}`).join('\n')}

חומר הלימוד:
---
${documentContent}
---

קבע את התשובה הנכונה (0-3) והסבר קצר (משפט אחד) מדוע זו התשובה הנכונה. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו (ללא **). כל התוכן בעברית.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: answerSchema,
    },
  });

  const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
  const result = JSON.parse(cleanedText);
  
  if (result.correctAnswerIndex < 0 || result.correctAnswerIndex >= options.length) {
    throw new Error(`Invalid answer index: ${result.correctAnswerIndex}`);
  }

  return {
    correctAnswerIndex: result.correctAnswerIndex,
    explanation: result.explanation
  };
}

export async function determineAnswerAndExplanation(
  question: string,
  options: string[],
  documentContent: string
): Promise<{ correctAnswerIndex: number; explanation: string }> {
  return tryWithFallback(
    () => determineAnswerAndExplanationOpenAI(question, options, documentContent),
    () => determineAnswerAndExplanationGemini(question, options, documentContent),
    "נכשל בקביעת התשובה הנכונה."
  );
}

// Continue with other functions - using Gemini for now for chat, flashcards, etc.
// We can add OpenAI implementations later if needed

// Flashcard generation with OpenAI
async function generateFlashcardsOpenAI(documentContent: string, count: number): Promise<Flashcard[]> {
  const openai = getOpenAI();
  
  // Add randomization seed to prompt for variety
  const randomSeed = Math.random().toString(36).substring(7);
  
  const prompt = `אתה מורה מומחה למבחן התיווך הישראלי. תפקידך הוא לזהות את עקרונות הליבה המשפטיים, ההגדרות והכללים המרכזיים הנבחנים במסמך המצורף. בהתבסס על כך, צור סט חדש וייחודי של ${count} כרטיסיות לימוד בפורמט של שאלה-תשובה. חשוב: נסה לבחור מושגים שונים ונושאים שונים מאלו שכבר נבחרו בעבר. כל כרטיסייה צריכה להתמקד במושג אחד חשוב. השאלות צריכות להיות ברורות. התשובות חייבות להיות קצרות ותמציתיות באופן קיצוני - משפט קצר אחד או שניים לכל היותר. יש לנסח אותן בשפה פשוטה וישירה. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (ללא כוכביות **). אל תהפוך את שאלות המבחן הקיימות לכרטיסיות; במקום זאת, זקק מהן את הידע המשפטי הבסיסי. כל התוכן חייב להיות בעברית.

המסמך המכיל מבחנים קודמים הוא:
---
${documentContent}
---

השב ב-JSON בלבד בפורמט הבא:
[
  {
    "question": "שאלה",
    "answer": "תשובה קצרה"
  }
]`;

  const response = await openai.chat.completions.create({
    model: openAIModel,
    messages: [
      { 
        role: 'system', 
        content: 'אתה עוזר מומחה ביצירת כרטיסיות לימוד. אתה תמיד מחזיר JSON בפורמט הבא: {"flashcards": [{"question": "...", "answer": "..."}]} ללא טקסט נוסף.' 
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9, // Higher temperature for more variety in flashcards
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse JSON response
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  // Handle both array and object with flashcards array
  const flashcards = Array.isArray(parsed) ? parsed : (parsed.flashcards || parsed.data || []);
  
  if (!Array.isArray(flashcards) || flashcards.length === 0) {
    throw new Error('Invalid response format from OpenAI - no flashcards found');
  }

  return flashcards;
}

// Flashcard generation with Gemini (fallback)
async function generateFlashcardsGemini(documentContent: string, count: number): Promise<Flashcard[]> {
  const ai = await getGemini();
  
  const prompt = `אתה מורה מומחה למבחן התיווך הישראלי. תפקידך הוא לזהות את עקרונות הליבה המשפטיים, ההגדרות והכללים המרכזיים הנבחנים במסמך המצורף. בהתבסס על כך, צור סט של ${count} כרטיסיות לימוד בפורמט של שאלה-תשובה. כל כרטיסייה צריכה להתמקד במושג אחד חשוב. השאלות צריכות להיות ברורות. התשובות חייבות להיות קצרות ותמציתיות באופן קיצוני - משפט קצר אחד או שניים לכל היותר. יש לנסח אותן בשפה פשוטה וישירה. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (ללא כוכביות **). אל תהפוך את שאלות המבחן הקיימות לכרטיסיות; במקום זאת, זקק מהן את הידע המשפטי הבסיסי. כל התוכן חייב להיות בעברית.

המסמך המכיל מבחנים קודמים הוא:
---
${documentContent}
---`;

  const flashcardSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        answer: { type: Type.STRING },
      },
      required: ["question", "answer"],
    },
  };

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: flashcardSchema,
    },
  });

  const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
  return JSON.parse(cleanedText) as Flashcard[];
}

export async function generateFlashcards(documentContent: string, count: number): Promise<Flashcard[]> {
  return tryWithFallback(
    () => generateFlashcardsOpenAI(documentContent, count),
    () => generateFlashcardsGemini(documentContent, count),
    "נכשל ביצירת כרטיסיות."
  );
}

// Create OpenAI chat session (primary)
function createChatSessionOpenAI(documentContent: string, userName?: string): any {
  const name = userName || 'חבר';
  const systemInstruction = `אתה דניאל, מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. אתה מדבר עם ${name}. הידע שלך מבוסס באופן בלעדי על המסמך שסופק. דבר עם ${name} בגובה העיניים ובאופן ישיר וחם. השתמש בשם ${name} כשאתה פונה אליו/ה. תשובותיך חייבות להיות קצרות מאוד ותמציתיות. הימנע מהסברים ארוכים. חשוב ביותר: אל תשתמש בשום פנים ואופן בעיצוב טקסט כמו הדגשה (ללא **). 

חשוב מאוד - הגבלות נוקשות:
- ענה רק על שאלות הקשורות ישירות לחוקי מקרקעין בישראל, למבחן הרישוי למתווכי מקרקעין, ולשאלות הבחינה.
- הנושאים המורשים בלבד: דמי תיווך, הערת אזהרה, בלעדיות, זכויות וחובות מתווכים, הסכמים, רישוי מתווכים, חוק המקרקעין, חוק המתווכים, שאלות מהבחינות, והחומר הנלמד במבחן הרישוי.
- אם ${name} שואל שאלה שאינה קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות, או כל נושא אחר), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל. יש לך שאלה על חומר הלימוד?"
- אין לענות על שאלות שאינן קשורות למבחן התיווך ולחוקי המקרקעין, גם אם הן נראות מעניינות.
- אם התשובה לא נמצאת במסמך, ציין זאת בבירור ונסה להשיב על בסיס הידע הכללי מהמסמך.

ענה על שאלותיו של ${name}, הבהר מושגים ועזור לו/ה להבין את החומר הנלמד מהבחינות. השב תמיד בעברית. המסמך לעיונך:

---
${documentContent}
---`;

  return {
    type: 'openai',
    systemInstruction,
    documentContent,
    userName: name,
  };
}

// Create Gemini chat session (fallback)
async function createChatSessionGemini(documentContent: string, userName?: string): Promise<Chat> {
  const ai = await getGemini();
  const name = userName || 'חבר';
  const systemInstruction = `אתה דניאל, מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. אתה מדבר עם ${name}. הידע שלך מבוסס באופן בלעדי על המסמך שסופק. דבר עם ${name} בגובה העיניים ובאופן ישיר וחם. השתמש בשם ${name} כשאתה פונה אליו/ה. תשובותיך חייבות להיות קצרות מאוד ותמציתיות. הימנע מהסברים ארוכים. חשוב ביותר: אל תשתמש בשום פנים ואופן בעיצוב טקסט כמו הדגשה (ללא **). 

חשוב מאוד - הגבלות נוקשות:
- ענה רק על שאלות הקשורות ישירות לחוקי מקרקעין בישראל, למבחן הרישוי למתווכי מקרקעין, ולשאלות הבחינה.
- הנושאים המורשים בלבד: דמי תיווך, הערת אזהרה, בלעדיות, זכויות וחובות מתווכים, הסכמים, רישוי מתווכים, חוק המקרקעין, חוק המתווכים, שאלות מהבחינות, והחומר הנלמד במבחן הרישוי.
- אם ${name} שואל שאלה שאינה קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות, או כל נושא אחר), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל. יש לך שאלה על חומר הלימוד?"
- אין לענות על שאלות שאינן קשורות למבחן התיווך ולחוקי המקרקעין, גם אם הן נראות מעניינות.
- אם התשובה לא נמצאת במסמך, ציין זאת בבירור ונסה להשיב על בסיס הידע הכללי מהמסמך.

ענה על שאלותיו של ${name}, הבהר מושגים ועזור לו/ה להבין את החומר הנלמד מהבחינות. השב תמיד בעברית. המסמך לעיונך:

---
${documentContent}
---`;

  const chat: Chat = ai.chats.create({
    model: geminiModel,
    config: {
      systemInstruction,
    },
  });
  return chat;
}

export async function createChatSession(documentContent: string, userName?: string): Promise<Chat> {
  // Try OpenAI first, fallback to Gemini
  try {
    return await createChatSessionOpenAI(documentContent, userName) as any;
  } catch (error) {
    console.warn('Failed to create OpenAI chat session, using Gemini:', error);
    return await createChatSessionGemini(documentContent, userName);
  }
}

// Create OpenAI explanation chat session (primary)
async function createExplanationChatSessionOpenAI(documentContent: string, context: string, userName?: string): Promise<any> {
  const name = userName || 'חבר';
  const systemInstruction = `אתה דניאל, מורה פרטי מומחה למבחן התיווך הישראלי. אתה מדבר עם ${name}. הידע שלך מבוסס באופן בלעדי על חומר הלימוד שסופק. ${name} ביקש הסבר נוסף על הנושא הבא:
---
${context}
---

חשוב מאוד - הגבלות:
- הסבר רק נושאים הקשורים ישירות לחוקי מקרקעין בישראל ולמבחן הרישוי למתווכי מקרקעין (דמי תיווך, הערת אזהרה, בלעדיות, זכויות וחובות מתווכים, הסכמים, רישוי, חוק המקרקעין, חוק המתווכים, וכל נושא מהחומר הנלמד במבחן).
- אם ${name} שואל שאלה על הנושא שהוצג לעיל (שאלה מהמבחן, הסבר על חומר הלימוד, או כל נושא הקשור לחוקי מקרקעין), ענה עליה בהרחבה.
- אם ${name} שואל שאלה שאינה קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם נושאים הקשורים לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."

הסבר את הנושא ל${name} בצורה ברורה ותמציתית ביותר. השתמש בשפה פשוטה ודוגמאות קצרות. הימנע מפרטים מיותרים. השתמש בשם ${name} כשאתה פונה אליו/ה. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד הדגשה (ללא **). התשובה צריכה להיות קצרה וישירה. השב תמיד בעברית.

חומר לימוד:
---
${documentContent}
---`;

  return {
    type: 'openai',
    systemInstruction,
    documentContent,
    context,
    userName: name,
  };
}

// Create Gemini explanation chat session (fallback)
async function createExplanationChatSessionGemini(documentContent: string, context: string, userName?: string): Promise<Chat> {
  const ai = await getGemini();
  const name = userName || 'חבר';
  const systemInstruction = `אתה דניאל, מורה פרטי מומחה למבחן התיווך הישראלי. אתה מדבר עם ${name}. הידע שלך מבוסס באופן בלעדי על חומר הלימוד שסופק. ${name} ביקש הסבר נוסף על הנושא הבא:
---
${context}
---

חשוב מאוד - הגבלות:
- הסבר רק נושאים הקשורים ישירות לחוקי מקרקעין בישראל ולמבחן הרישוי למתווכי מקרקעין (דמי תיווך, הערת אזהרה, בלעדיות, זכויות וחובות מתווכים, הסכמים, רישוי, חוק המקרקעין, חוק המתווכים, וכל נושא מהחומר הנלמד במבחן).
- אם ${name} שואל שאלה על הנושא שהוצג לעיל (שאלה מהמבחן, הסבר על חומר הלימוד, או כל נושא הקשור לחוקי מקרקעין), ענה עליה בהרחבה.
- אם ${name} שואל שאלה שאינה קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם נושאים הקשורים לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."

הסבר את הנושא ל${name} בצורה ברורה ותמציתית ביותר. השתמש בשפה פשוטה ודוגמאות קצרות. הימנע מפרטים מיותרים. השתמש בשם ${name} כשאתה פונה אליו/ה. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד הדגשה (ללא **). התשובה צריכה להיות קצרה וישירה. השב תמיד בעברית.

חומר לימוד:
---
${documentContent}
---`;

  const chat: Chat = ai.chats.create({
    model: geminiModel,
    config: {
      systemInstruction,
    },
  });
  return chat;
}

export async function createExplanationChatSession(documentContent: string, context: string, userName?: string): Promise<Chat> {
  // Try OpenAI first, fallback to Gemini
  try {
    return await createExplanationChatSessionOpenAI(documentContent, context, userName) as any;
  } catch (error) {
    console.warn('Failed to create OpenAI explanation chat session, using Gemini:', error);
    return await createExplanationChatSessionGemini(documentContent, context, userName);
  }
}

export async function analyzeProgress(results: QuizResult[], documentContent: string, userName?: string): Promise<AnalysisResult> {
  const name = userName || 'המשתמש';
  
  // Separate correct and incorrect answers for better analysis
  const correctResults = results.filter(r => r.isCorrect);
  const incorrectResults = results.filter(r => !r.isCorrect);
  
  const correctQuestionsText = correctResults.length > 0 
    ? correctResults.map((r, i) => `שאלה ${i + 1}: ${r.question}`).join('\n')
    : 'אין שאלות שנענו נכון';
    
  const incorrectQuestionsText = incorrectResults.length > 0
    ? incorrectResults.map((r, i) => `שאלה ${i + 1}: ${r.question}\nהסבר לתשובה הנכונה: ${r.explanation || 'לא צוין הסבר'}`).join('\n\n')
    : 'אין שאלות שנענו לא נכון';

  const prompt = `אתה מורה מקצועי ומנוסה לניתוח ביצועים במבחן הרישוי למתווכי מקרקעין בישראל. אתה מדבר ישירות אל ${name} ומספק משוב מפורט ומעודד.

**חשוב מאוד - כתוב בגוף שני (אתה/לך/עליך), לא בגוף שלישי:**
1. **חוזקות**: זהה עד 3 נושאים מרכזיים שבהם אתה מפגין הבנה טובה. לכל נושא, כתוב ישירות ל${name} בגוף שני (למשל, "אתה עונה נכון על שאלות בנושא X, מה שמעיד על הבנה טובה שלך של..."). אם אין תשובות נכונות, הרשימה צריכה להיות ריקה.
2. **חולשות**: זהה עד 3 נושאים מרכזיים שבהם אתה מתקשה. לכל נושא, כתוב ישירות ל${name} בגוף שני מה הבעיה ומה צריך לשפר (למשל, "אתה מתקשה בנושא X, כפי שניתן לראות מהתשובות השגויות שלך. מומלץ לך להתמקד ב..."). אם כל התשובות נכונות, הרשימה צריכה להיות ריקה.
3. **המלצות**: כתוב המלצה תמציתית ומעשית לשיפור הלמידה, כתובה ישירות ל${name} בגוף שני ("אתה צריך", "מומלץ לך", "עליך", "נסה ל..." וכו'). ההמלצה צריכה להיות מבוססת על החולשות שזוהו ולהציע דרכים קונקרטיות לשיפור. אם אין חולשות, ספק המלצה כללית להמשך תרגול.

שאלות שנענו נכון:
---
${correctQuestionsText}
---

שאלות שנענו לא נכון (כולל הסברים לתשובה הנכונה):
---
${incorrectQuestionsText}
---

חומר הלימוד:
---
${documentContent}
---

**דרישות לפורמט התשובה:**
- החזר JSON עם המבנה הבא:
  {
    "strengths": ["נושא 1 עם הסבר קצר בגוף שני (אתה/לך)", "נושא 2 עם הסבר קצר בגוף שני", "נושא 3 עם הסבר קצר בגוף שני"],
    "weaknesses": ["נושא 1 עם הסבר בגוף שני מה הבעיה ומה לשפר", "נושא 2 עם הסבר בגוף שני מה הבעיה ומה לשפר", "נושא 3 עם הסבר בגוף שני מה הבעיה ומה לשפר"],
    "recommendations": "המלצה תמציתית ומעשית כתובה בגוף שני"
  }
- **חשוב מאוד**: כל הטקסט חייב להיות בגוף שני (אתה/לך/עליך/שלך), לא בגוף שלישי (המשתמש/הוא/שלו)
- כל פריט ב-strengths צריך לכלול הסבר קצר בגוף שני מדוע זה חוזקה (למשל: "אתה מפגין הבנה טובה בנושא X")
- כל פריט ב-weaknesses צריך לכלול הסבר קצר בגוף שני מה הבעיה ומה צריך לשפר (למשל: "אתה מתקשה בנושא X, מומלץ לך להתמקד ב...")
- ההמלצות צריכות להיות מעשיות וספציפיות, כתובות בגוף שני

כל התוכן חייב להיות בעברית.`;

  // Use OpenAI first, fallback to Gemini
  return tryWithFallback(
    async () => {
      // OpenAI implementation
      const openai = await getOpenAI();
      
      const response = await openai.chat.completions.create({
        model: openAIModel,
        messages: [
          { 
            role: 'system', 
            content: `אתה מורה מקצועי ומנוסה לניתוח ביצועים במבחן הרישוי למתווכי מקרקעין בישראל. תפקידך לספק משוב מפורט ומעודד ישירות למשתמש.

**חשוב מאוד - כתוב בגוף שני, לא בגוף שלישי:**
- תמיד החזר JSON עם strengths, weaknesses, ו-recommendations
- strengths: רשימה של עד 3 נושאים שבהם המשתמש מפגין הבנה טובה, עם הסבר קצר לכל נושא בגוף שני (אתה/לך/שלך) מדוע זה חוזקה. אם אין תשובות נכונות, החזר רשימה ריקה.
- weaknesses: רשימה של עד 3 נושאים שבהם המשתמש מתקשה, עם הסבר קצר לכל נושא בגוף שני (אתה/לך/עליך) מה הבעיה ומה צריך לשפר. אם כל התשובות נכונות, החזר רשימה ריקה.
- recommendations: המלצה תמציתית ומעשית כתובה בגוף שני (אתה/לך/עליך), מבוססת על החולשות. אם אין חולשות, ספק המלצה כללית.
- **כל הטקסט חייב להיות בגוף שני (אתה/לך/עליך/שלך), לא בגוף שלישי (המשתמש/הוא/שלו)**
- כל התוכן בעברית.`
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5, // Slightly higher for more detailed explanations
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Invalid JSON response from OpenAI');
        }
      }

      // Validate and return
      if (!parsed.strengths || !parsed.weaknesses || !parsed.recommendations) {
        throw new Error('Invalid analysis structure from OpenAI');
      }

      return {
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        recommendations: parsed.recommendations || '',
      } as AnalysisResult;
    },
    async () => {
      // Gemini fallback
      const ai = await getGemini();
      
      const analysisSchema = {
        type: Type.OBJECT,
        properties: {
          strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "רשימה של עד 3 נושאים מרכזיים שבהם המשתמש מפגין הבנה טובה, כתובים בגוף שני (אתה/לך/שלך). כל פריט צריך לכלול הסבר קצר בגוף שני מדוע זה חוזקה. אם אין תשובות נכונות, הרשימה צריכה להיות ריקה. חשוב: כתוב בגוף שני (אתה עונה נכון...), לא בגוף שלישי (המשתמש עונה...)."
          },
          weaknesses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "רשימה של עד 3 נושאים מרכזיים שבהם המשתמש מתקשה, כתובים בגוף שני (אתה/לך/עליך). כל פריט צריך לכלול הסבר קצר בגוף שני מה הבעיה ומה צריך לשפר. אם כל התשובות נכונות, הרשימה צריכה להיות ריקה. חשוב: כתוב בגוף שני (אתה מתקשה...), לא בגוף שלישי (המשתמש מתקשה...)."
          },
          recommendations: {
            type: Type.STRING,
            description: "המלצה תמציתית לשיפור הלמידה, כתובה ישירות למשתמש בגוף שני (אתה, לך, עליך וכו'). ההמלצה צריכה להיות מבוססת על החולשות. אם אין חולשות, ספק המלצה כללית. חשוב מאוד: כתוב ישירות אל המשתמש בגוף שני (אתה צריך...), לא עליו בגוף שלישי."
          }
        },
        required: ["strengths", "weaknesses", "recommendations"]
      };

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: geminiModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
        },
      });

      const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(cleanedText) as AnalysisResult;
    },
    "נכשל בניתוח התוצאות."
  );
}

// Continue chat with OpenAI
async function continueChatOpenAI(chat: any, message: string, history: ChatMessage[]): Promise<string> {
  const openai = await getOpenAI();
  
  // Enhance system instruction with topic restriction reminder
  // For explanation chat sessions, the context is always a quiz question, so be more permissive
  const isExplanationChat = chat.context && (chat.context.includes('שאלה:') || chat.context.includes('תשובה נכונה:'));
  
  const enhancedSystemInstruction = isExplanationChat 
    ? `${chat.systemInstruction}

תזכורת חשובה: המשתמש שואל על שאלה מהמבחן שהוצגה לעיל. ענה על שאלותיו בהרחבה - הן על השאלה הספציפית, על הנושאים הקשורים, על חוקי מקרקעין, ועל כל נושא הקשור למבחן הרישוי למתווכי מקרקעין. רק אם השאלה לא קשורה כלל לחוקי מקרקעין או למבחן (למשל: מתמטיקה כללית, היסטוריה, פוליטיקה, חדשות), ענה: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל. יש לך שאלה על חומר הלימוד?"`
    : `${chat.systemInstruction}

תזכורת חשובה: אם ההודעה של המשתמש קשורה לחוקי מקרקעין, למבחן הרישוי למתווכי מקרקעין, לשאלות מהבחינה, או לחומר הלימוד, ענה עליה בהרחבה. אם ההודעה לא קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל. יש לך שאלה על חומר הלימוד?"`;
  
  // Convert history to OpenAI format
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: enhancedSystemInstruction }
  ];
  
  // Add history (only last 10 messages to stay within token limits)
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text
    });
  }
  
  // Add current message
  messages.push({ role: 'user', content: message });
  
  const response = await openai.chat.completions.create({
    model: openAIModel,
    messages: messages as any,
    temperature: 0.7,
  });
  
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }
  
  return content.trim();
}

// Continue chat with Gemini (fallback)
async function continueChatGemini(chat: Chat, message: string, history: ChatMessage[]): Promise<string> {
  try {
    const response = await chat.sendMessage(message);
    return response.text;
  } catch (error) {
    console.error("Error continuing chat with Gemini:", error);
    throw error;
  }
}

export async function continueChat(chat: Chat | any, message: string, history: ChatMessage[]): Promise<string> {
  // Check if it's an OpenAI chat session
  if (chat && typeof chat === 'object' && chat.type === 'openai') {
    return tryWithFallback(
      () => continueChatOpenAI(chat, message, history),
      async () => {
        // Fallback: create Gemini chat and continue
        const geminiChat = await createChatSessionGemini(chat.documentContent, chat.userName);
        return await continueChatGemini(geminiChat, message, history);
      },
      "נכשל בשליחת ההודעה."
    );
  }
  
  // It's a Gemini chat session
  return tryWithFallback(
    async () => {
      // Try to continue with Gemini
      return await continueChatGemini(chat, message, history);
    },
    async () => {
      // Fallback: create new OpenAI chat and continue
      const openaiChat = await createChatSessionOpenAI(chat.documentContent || '', chat.userName);
      return await continueChatOpenAI(openaiChat, message, history);
    },
    "נכשל בשליחת ההודעה."
  );
}

// Hint generation with OpenAI
async function generateHintOpenAI(question: string, answer: string, documentContent: string, userName?: string): Promise<string> {
  const openai = await getOpenAI();
  const name = userName || 'חבר';
  
  const prompt = `אתה מורה פרטי למבחן התיווך הישראלי. ${name} מתקשה בשאלה הבאה:

שאלה: ${question}
תשובה נכונה: ${answer}

חומר הלימוד:
---
${documentContent}
---

ספק רמז קצר ומעודן שיעזור ל${name} להבין את התשובה הנכונה, מבלי לחשוף אותה ישירות. השתמש בשם ${name} כשאתה פונה אליו/ה. הרמז צריך להיות קצר מאוד (משפט אחד או שניים). השב בעברית.`;

  const response = await openai.chat.completions.create({
    model: openAIModel,
    messages: [
      { 
        role: 'system', 
        content: 'אתה מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. אתה תמיד מחזיר תשובה קצרה ובעברית.' 
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return content.trim();
}

// Hint generation with Gemini (fallback)
async function generateHintGemini(question: string, answer: string, documentContent: string, userName?: string): Promise<string> {
  const ai = await getGemini();
  const name = userName || 'חבר';
  
  const prompt = `אתה מורה פרטי למבחן התיווך הישראלי. ${name} מתקשה בשאלה הבאה:

שאלה: ${question}
תשובה נכונה: ${answer}

חומר הלימוד:
---
${documentContent}
---

ספק רמז קצר ומעודן שיעזור ל${name} להבין את התשובה הנכונה, מבלי לחשוף אותה ישירות. השתמש בשם ${name} כשאתה פונה אליו/ה. הרמז צריך להיות קצר מאוד (משפט אחד או שניים). השב בעברית.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt,
  });

  return response.text;
}

export async function generateHint(question: string, answer: string, documentContent: string, userName?: string): Promise<string> {
  return tryWithFallback(
    () => generateHintOpenAI(question, answer, documentContent, userName),
    () => generateHintGemini(question, answer, documentContent, userName),
    "נכשל ביצירת רמז."
  );
}

export async function generateSpeech(textToSpeak: string): Promise<string> {
  // Use OpenAI TTS (text-to-speech) API
  try {
    const openai = await getOpenAI();
    
    console.log('Generating speech with OpenAI TTS for text:', textToSpeak.substring(0, 50));
    
    // Use OpenAI TTS API
    const response = await openai.audio.speech.create({
      model: "tts-1", // Use tts-1 for faster, cheaper TTS
      voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
      input: textToSpeak,
      response_format: "mp3", // Return as MP3
    });

    // Convert the response to base64 (browser-compatible)
    const arrayBuffer = await response.arrayBuffer();
    // Convert ArrayBuffer to base64 in browser-compatible way
    const bytes = new Uint8Array(arrayBuffer);
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binaryString);
    
    console.log('OpenAI TTS successful, audio length:', base64Audio.length);
    return base64Audio;
  } catch (openAIError: any) {
    console.error("OpenAI TTS failed, trying browser Web Speech API:", openAIError);
    
    // Fallback to browser Web Speech API
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        // Use browser's built-in speech synthesis
        return new Promise((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = 'he-IL'; // Hebrew
          utterance.rate = 0.9;
          utterance.pitch = 1;
          
          // For browser TTS, we return a special marker that will be handled differently
          // The component should use the browser API directly instead of base64
          utterance.onend = () => {
            console.log('Browser TTS completed successfully');
            resolve('browser-tts-success');
          };
          utterance.onerror = (error) => {
            console.error('Browser TTS error:', error);
            reject(new Error('Browser TTS failed'));
          };
          
          window.speechSynthesis.speak(utterance);
        });
      } else {
        throw new Error("Text-to-speech not supported in this browser");
      }
    } catch (browserError) {
      console.error("Browser TTS also failed:", browserError);
      throw new Error("נכשל ביצירת אודיו. אנא נסה שוב.");
    }
  }
}

// Targeted flashcard generation with OpenAI
async function generateTargetedFlashcardsOpenAI(weaknesses: string[], documentContent: string, count: number): Promise<Flashcard[]> {
  const openai = await getOpenAI();
  const weaknessesText = weaknesses.join(', ');
  
  // Add randomization seed to prompt for variety
  const randomSeed = Math.random().toString(36).substring(7);
  
  const prompt = `אתה מורה מומחה למבחן התיווך הישראלי. המשתמש מתקשה בנושאים הבאים: ${weaknessesText}

חשוב: צור סט חדש וייחודי של כרטיסיות - נסה לבחור מושגים שונים וזוויות שונות לנושאים אלה מאלו שכבר נבחרו בעבר.

צור ${count} כרטיסיות לימוד שמתמקדות בנושאים אלה. כל כרטיסייה צריכה להיות בפורמט שאלה-תשובה, עם שאלה ברורה ותשובה קצרה מאוד (משפט אחד או שניים). התשובות חייבות להיות פשוטות וישירות. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו (ללא **). כל התוכן בעברית.

חומר הלימוד:
---
${documentContent}
---

השב ב-JSON בלבד בפורמט הבא:
[
  {
    "question": "שאלה",
    "answer": "תשובה קצרה"
  }
]`;

  const response = await openai.chat.completions.create({
    model: openAIModel,
    messages: [
      { 
        role: 'system', 
        content: 'אתה עוזר מומחה ביצירת כרטיסיות לימוד ממוקדות. אתה תמיד מחזיר JSON בפורמט הבא: {"flashcards": [{"question": "...", "answer": "..."}]} ללא טקסט נוסף.' 
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9, // Higher temperature for more variety in flashcards
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse JSON response
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  // Handle both array and object with flashcards array
  const flashcards = Array.isArray(parsed) ? parsed : (parsed.flashcards || parsed.data || []);
  
  if (!Array.isArray(flashcards) || flashcards.length === 0) {
    throw new Error('Invalid response format from OpenAI - no flashcards found');
  }

  return flashcards;
}

// Targeted flashcard generation with Gemini (fallback)
async function generateTargetedFlashcardsGemini(weaknesses: string[], documentContent: string, count: number): Promise<Flashcard[]> {
  const ai = await getGemini();
  const weaknessesText = weaknesses.join(', ');
  
  const prompt = `אתה מורה מומחה למבחן התיווך הישראלי. המשתמש מתקשה בנושאים הבאים: ${weaknessesText}

צור ${count} כרטיסיות לימוד שמתמקדות בנושאים אלה. כל כרטיסייה צריכה להיות בפורמט שאלה-תשובה, עם שאלה ברורה ותשובה קצרה מאוד (משפט אחד או שניים). התשובות חייבות להיות פשוטות וישירות. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו (ללא **). כל התוכן בעברית.

חומר הלימוד:
---
${documentContent}
---`;

  const flashcardSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        answer: { type: Type.STRING },
      },
      required: ["question", "answer"],
    },
  };

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: flashcardSchema,
    },
  });

  const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
  return JSON.parse(cleanedText) as Flashcard[];
}

export async function generateTargetedFlashcards(weaknesses: string[], documentContent: string, count: number): Promise<Flashcard[]> {
  return tryWithFallback(
    () => generateTargetedFlashcardsOpenAI(weaknesses, documentContent, count),
    () => generateTargetedFlashcardsGemini(weaknesses, documentContent, count),
    "נכשל ביצירת כרטיסיות ממוקדות."
  );
}

// Targeted quiz generation with OpenAI
async function generateTargetedQuizOpenAI(weaknesses: string[], documentContent: string, count: number): Promise<QuizQuestion[]> {
  const openai = await getOpenAI();
  const weaknessesText = weaknesses.join(', ');
  
  const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. המשתמש מתקשה בנושאים הבאים: ${weaknessesText}

צור ${count} שאלות ממוקדות שמתמקדות בנושאים אלה. כל שאלה צריכה להיות בפורמט מבחן אמריקאי עם 4 אפשרויות, האינדקס של התשובה הנכונה, והסבר קצר (משפט אחד). ההסבר חייב להיות פשוט וישיר. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו (ללא **). כל התוכן בעברית.

חומר הלימוד:
---
${documentContent}
---

השב ב-JSON בלבד בפורמט הבא:
[
  {
    "question": "שאלה",
    "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
    "correctAnswerIndex": 0,
    "explanation": "הסבר קצר"
  }
]`;

  const response = await openai.chat.completions.create({
    model: openAIModel,
    messages: [
      { 
        role: 'system', 
        content: 'אתה עוזר מומחה ביצירת שאלות ממוקדות למבחן. אתה תמיד מחזיר JSON בפורמט הבא: {"questions": [{"question": "...", "options": ["...", "..."], "correctAnswerIndex": 0, "explanation": "..."}]} ללא טקסט נוסף.' 
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9, // Higher temperature for more variety in flashcards
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse JSON response
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  // Handle both array and object with questions array
  const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);
  
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Invalid response format from OpenAI - no questions found');
  }

  // Randomize options for each question
  return questions.map(q => {
    const correctAnswerText = q.options[q.correctAnswerIndex];
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
    const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
    
    return {
      ...q,
      options: shuffledOptions,
      correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0
    };
  });
}

// Targeted quiz generation with Gemini (fallback)
async function generateTargetedQuizGemini(weaknesses: string[], documentContent: string, count: number): Promise<QuizQuestion[]> {
  const ai = await getGemini();
  const weaknessesText = weaknesses.join(', ');
  
  const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. המשתמש מתקשה בנושאים הבאים: ${weaknessesText}

צור ${count} שאלות ממוקדות שמתמקדות בנושאים אלה. כל שאלה צריכה להיות בפורמט מבחן אמריקאי עם 4 אפשרויות, האינדקס של התשובה הנכונה, והסבר קצר (משפט אחד). ההסבר חייב להיות פשוט וישיר. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו (ללא **). כל התוכן בעברית.

חומר הלימוד:
---
${documentContent}
---`;

  const quizSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswerIndex: { type: Type.INTEGER },
        explanation: { type: Type.STRING },
      },
      required: ["question", "options", "correctAnswerIndex", "explanation"],
    },
  };

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: geminiModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: quizSchema,
    },
  });

  const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
  const questions = JSON.parse(cleanedText) as QuizQuestion[];
  
  if (!Array.isArray(questions)) {
    throw new Error("AI response is not a JSON array.");
  }
  
  // Randomize options for AI-generated questions
  return questions.map(q => {
    const correctAnswerText = q.options[q.correctAnswerIndex];
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
    const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
    
    return {
      ...q,
      options: shuffledOptions,
      correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0
    };
  });
}

export async function generateTargetedQuiz(weaknesses: string[], documentContent: string, count: number): Promise<QuizQuestion[]> {
  return tryWithFallback(
    () => generateTargetedQuizOpenAI(weaknesses, documentContent, count),
    () => generateTargetedQuizGemini(weaknesses, documentContent, count),
    "נכשל ביצירת בוחן ממוקד."
  );
}

// Generate questions with topic distribution (70% weak topics, 30% strong topics)
export async function generateQuizWithTopicDistribution(
  weakTopics: string[],
  strongTopics: string[],
  documentContent: string,
  count: number
): Promise<QuizQuestion[]> {
  const weakCount = Math.round(count * 0.7);
  const strongCount = count - weakCount;
  
  const questions: QuizQuestion[] = [];
  
  // Generate 70% from weak topics
  if (weakTopics.length > 0 && weakCount > 0) {
    try {
      const weakQuestions = await generateTargetedQuiz(weakTopics, documentContent, weakCount);
      questions.push(...weakQuestions);
    } catch (error) {
      console.error('Error generating weak topic questions:', error);
      // Fallback to general questions if targeted generation fails
      if (questions.length === 0) {
        const generalQuestions = await generateQuiz(documentContent, weakCount);
        questions.push(...generalQuestions);
      }
    }
  } else if (weakCount > 0) {
    // No weak topics available, generate general questions
    const generalQuestions = await generateQuiz(documentContent, weakCount);
    questions.push(...generalQuestions);
  }
  
  // Generate 30% from strong topics (or general if no strong topics)
  if (strongTopics.length > 0 && strongCount > 0) {
    try {
      const strongQuestions = await generateTargetedQuiz(strongTopics, documentContent, strongCount);
      questions.push(...strongQuestions);
    } catch (error) {
      console.error('Error generating strong topic questions:', error);
      // Fallback to general questions
      const generalQuestions = await generateQuiz(documentContent, strongCount);
      questions.push(...generalQuestions);
    }
  } else if (strongCount > 0) {
    // No strong topics available, generate general questions
    const generalQuestions = await generateQuiz(documentContent, strongCount);
    questions.push(...generalQuestions);
  }
  
  // Shuffle questions to mix weak and strong topics
  return questions.sort(() => Math.random() - 0.5);
}


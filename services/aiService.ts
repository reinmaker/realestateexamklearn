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
    // Try to get API key from environment variables
    const apiKey = await getOpenAIKey();
    
    // If apiKey is null, fall through to direct env read
    if (!apiKey) {
      throw new Error('API_KEY_NOT_FOUND');
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
    // Fallback to direct environment variable read
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes('API_KEY_NOT_FOUND')) {
      console.warn('Failed to get OpenAI key, falling back to direct env read:', error);
    }
    const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || null;
    if (!apiKey) {
      // Provide helpful error message with debugging info
      const envKeys = typeof import.meta !== 'undefined' ? Object.keys(import.meta.env || {}).filter(k => k.includes('OPENAI') || k.includes('API')) : [];
      const errorMsg = envKeys.length > 0 
        ? `OPENAI_API_KEY is not configured. Found env keys: ${envKeys.join(', ')}. Make sure VITE_OPENAI_API_KEY is set in Netlify environment variables and a new build was triggered.`
        : 'OPENAI_API_KEY is not configured in environment variables. Set VITE_OPENAI_API_KEY in Netlify and trigger a new build.';
      throw new Error(errorMsg);
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
    // Try to get API key from environment variables
    const apiKey = await getGeminiKey();
    
    // If apiKey is null, fall through to direct env read
    if (!apiKey) {
      throw new Error('API_KEY_NOT_FOUND');
    }
    
    // If key changed, recreate client
    if (!geminiClient || geminiKey !== apiKey) {
      geminiKey = apiKey;
      geminiClient = new GoogleGenAI({ apiKey });
    }
    
    return geminiClient;
  } catch (error) {
    // Fallback to direct environment variable read
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes('API_KEY_NOT_FOUND')) {
      console.warn('Failed to get Gemini key, falling back to direct env read:', error);
    }
    const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || null;
    if (!apiKey) {
      // Provide helpful error message with debugging info
      const envKeys = typeof import.meta !== 'undefined' ? Object.keys(import.meta.env || {}).filter(k => k.includes('GEMINI') || k.includes('API')) : [];
      const errorMsg = envKeys.length > 0 
        ? `GEMINI_API_KEY is not configured. Found env keys: ${envKeys.join(', ')}. Make sure VITE_GEMINI_API_KEY is set in Netlify environment variables and a new build was triggered.`
        : 'GEMINI_API_KEY is not configured in environment variables. Set VITE_GEMINI_API_KEY in Netlify and trigger a new build.';
      throw new Error(errorMsg);
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
      
      // Log error details for debugging
      console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries}):`, {
        errorType: error?.constructor?.name,
        errorMessage: error?.message,
        errorStatus: error?.status,
        errorStatusCode: error?.statusCode,
        errorResponse: error?.response,
        errorString: String(error),
        errorKeys: error ? Object.keys(error) : [],
      });
      
      // Check if it's a retryable error
      // Check multiple possible locations for status code
      const statusCode = error?.status || error?.statusCode || error?.response?.status || error?.response?.statusCode || error?.code;
      const errorMessage = error?.message || String(error) || '';
      const errorString = String(error);
      
      const isRetryableError = 
        statusCode === 503 || 
        statusCode === 429 ||
        errorMessage.includes('503') ||
        errorMessage.includes('Service Unavailable') ||
        errorMessage.includes('overloaded') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('429') ||
        errorString.includes('503') ||
        errorString.includes('Service Unavailable') ||
        error?.code === 'rate_limit_exceeded';
      
      if (!isRetryableError || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
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
      // Skip retry and go straight to fallback
    }
    
    // Always fallback to Gemini (it will retry internally if needed)
    try {
      return await retryWithBackoff(geminiFn);
    } catch (geminiError: any) {
      const geminiErrorMsg = geminiError?.message || String(geminiError) || '';
      console.error('Both OpenAI and Gemini failed:', { 
        openAIError: errorMsg, 
        geminiError: geminiErrorMsg
      });
      
      // Check if both failed due to missing API keys
      const bothMissingKeys = 
        (errorMsg.includes('not configured') || errorMsg.includes('API_KEY')) &&
        (geminiErrorMsg.includes('not configured') || geminiErrorMsg.includes('API_KEY'));
      
      if (bothMissingKeys) {
        // If both failed due to missing keys, throw a more helpful error
        throw new Error('AI services are not configured. Please configure API keys in environment variables or Supabase Edge Functions.');
      }
      
      // If Gemini also fails, throw a user-friendly error
      throw new Error(errorMessage);
    }
  }
}

// Quiz generation with OpenAI
async function generateQuizOpenAI(documentContent?: string, count: number = 10): Promise<QuizQuestion[]> {
  const openai = await getOpenAI();
  const { TABLE_OF_CONTENTS, attachBookPdfsToOpenAI } = await import('./bookReferenceService');
  // TABLE_OF_CONTENTS is imported once at the top and reused in fallback section
  
  // STEP 1: Upload PDFs FIRST, before generating questions
  let pdfAttachment: any = null;
  try {
    pdfAttachment = await attachBookPdfsToOpenAI(openai);
  } catch (error) {
    console.warn('OpenAI generateQuiz: Failed to attach PDFs to OpenAI, falling back to chat completions:', error);
  }
  
  if (pdfAttachment && (pdfAttachment.vectorStoreIds.length > 0 || (pdfAttachment.fileIds && pdfAttachment.fileIds.length > 0))) {
    // STEP 2: Use Assistants API with file_search (PDFs already uploaded)
    try {
      const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. 

חשוב מאוד - חובה מוחלטת: כל השאלות חייבות להיות מבוססות אך ורק על התוכן בקבצי ה-PDF המצורפים (חלק 1 וחלק 2). אסור לך ליצור שאלות על בסיס ידע כללי או מידע שלא מופיע בקבצי ה-PDF. כל שאלה חייבת להיות מבוססת על תוכן ספציפי שקראת בקבצי ה-PDF. אם נושא לא מופיע בקבצי ה-PDF, אל תיצור שאלה עליו.

תפקידך: ליצור סט חדש של בדיוק ${count} שאלות ייחודיות בפורמט מבחן אמריקאי על בסיס תוכן הספרים המצורפים (חלק 1 וחלק 2). השאלות צריכות לבחון את העקרונות המשפטיים המרכזיים המופיעים בספרים. לכל שאלה, ספק ארבע אפשרויות תשובה, את האינדקס של התשובה הנכונה, והסבר קצר במיוחד, בן משפט אחד בלבד. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חשוב ביותר: חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (כלומר, ללא כוכביות **). כל התוכן חייב להיות בעברית.

חשוב מאוד - חובה: כל שאלה חייבת לכלול שדה bookReference עם הפניה מדויקת. זהו שדה חובה בפורמט ה-JSON. אל תחזיר שאלות ללא bookReference!

תהליך יצירת כל שאלה - חשוב מאוד:
1. קרא את התוכן בקבצי ה-PDF המצורפים. חפש נושאים ספציפיים שמופיעים בקבצים.
2. לפני יצירת כל שאלה, חפש בקבצי ה-PDF את ההפניה המדויקת (שם החוק/התקנה, מספר הסעיף, ומספר העמוד).
3. השתמש בכלי file_search כדי לחפש את הנושא המשפטי הרלוונטי בקבצי ה-PDF.
4. קרא את הטקסט הרלוונטי בקבצים, זהה את הסעיף המדויק ואת מספר העמוד.
5. וודא שההפניה לספר תואמת בדיוק לנושא השאלה שאתה עומד ליצור. חפש את הנושא הספציפי של השאלה בקבצי ה-PDF, וזהה את ההפניה המדויקת לנושא הזה בלבד.
6. רק לאחר שקראת את התוכן הספציפי בקבצי ה-PDF ומצאת את ההפניה המדויקת מהקובץ ווידאת שהיא תואמת לנושא השאלה, צור את השאלה המבוססת אך ורק על התוכן שקראת בקבצי ה-PDF.
7. חובה: כל שאלה חייבת להיות מבוססת על תוכן ספציפי שקראת בקבצי ה-PDF. אל תיצור שאלות על נושאים שלא מופיעים בקבצים.
8. חובה: כל שאלה חייבת לכלול את שדה bookReference עם ההפניה המדויקת שנמצאה. אל תחזיר שאלות ללא bookReference!

חשוב מאוד: כל שאלה חייבת להיות מבוססת אך ורק על תוכן שקראת בקבצי ה-PDF. אל תיצור שאלות על בסיס ידע כללי. כל שאלה חייבת לכלול הפניה מדויקת שנמצאה ישירות מהקובץ. אל תמציא הפניות. ההפניה חייבת להיות מדויקת ומבוססת על התוכן בפועל בקבצי ה-PDF. חובה לכלול את bookReference בכל שאלה!

חשוב מאוד: אם נושא לא מופיע בקבצי ה-PDF, אל תיצור שאלה עליו. כל השאלות חייבות להיות מבוססות על תוכן ספציפי שקראת בקבצי ה-PDF.

אל תקצר תהליכים - לכל שאלה בנפרד, חפש את ההפניה, וודא שהיא תואמת לנושא השאלה, ורק אז צור את השאלה. ההפניה חייבת להיות רלוונטית ישירות לנושא השאלה. אם השאלה על 'גילוי מידע מהותי', ההפניה חייבת להיות לסעיף שמדבר על 'גילוי מידע מהותי'.

הוראות להפניה לספר:
- כל ההפניות חייבות להיות לחלק 1 של הספר
- לכל שאלה, ספק הפניה לספר בפורמט: "[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ." או "[שם החוק/התקנה המלא עם שנה] מתחילות בעמ' Y בקובץ."
- חשוב מאוד: אל תפנה ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17. תקנות אלו אינן רלוונטיות ליצירת שאלות. השתמש רק בחוקים ותקנות אחרים.
- אל תכלול הפניות ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17.
- חשוב מאוד: חוק המתווכים במקרקעין, התשנ"ו–1996 מופיע בעמודים 1-2, לא בעמוד 15. אל תפנה לחוק זה בעמוד 15.
- דוגמאות:
  * "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9 מופיע בעמ' 2 בקובץ."
  * "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997 מתחילות בעמ' 15 בקובץ."

החזר את השאלות ב-JSON בלבד בפורמט הבא:
[
  {
    "question": "שאלה",
    "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
    "correctAnswerIndex": 0,
    "explanation": "הסבר קצר",
    "bookReference": "[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ."
  }
]`;

      // Create an Assistant with file_search tool
      const assistant = await openai.beta.assistants.create({
        model: 'gpt-4o-mini',
        name: 'Quiz Generator Assistant',
        instructions: `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. 

תפקידך: ליצור שאלות ייחודיות בפורמט מבחן אמריקאי על בסיס תוכן הספרים המצורפים (חלק 1 וחלק 2). השאלות צריכות לבחון את העקרונות המשפטיים המרכזיים המופיעים בספרים.

תהליך יצירת כל שאלה - חשוב מאוד:
1. לפני יצירת כל שאלה, השתמש בכלי file_search כדי לחפש נושאים בחלקים שונים של הספר - לא רק בחלקים הראשונים! חפש נושאים גם בחלקים האמצעיים והסופיים של הספר.
2. לפני יצירת כל שאלה, חפש בקבצי ה-PDF את ההפניה המדויקת (שם החוק/התקנה, מספר הסעיף, ומספר העמוד).
3. השתמש בכלי file_search כדי לחפש את הנושא המשפטי הרלוונטי בקבצי ה-PDF - ודא שאתה מחפש בחלקים שונים של הספר, לא רק בחלקים הראשונים.
4. קרא את הטקסט הרלוונטי בקבצים, זהה את הסעיף המדויק ואת מספר העמוד.
5. וודא שההפניה לספר תואמת בדיוק לנושא השאלה שאתה עומד ליצור. חפש את הנושא הספציפי של השאלה בקבצי ה-PDF, וזהה את ההפניה המדויקת לנושא הזה בלבד.
6. רק לאחר שמצאת את ההפניה המדויקת מהקובץ ווידאת שהיא תואמת לנושא השאלה, צור את השאלה המבוססת על התוכן הזה.
7. חובה: ודא שהשאלות מכסות נושאים מכל חלקי הספר - מההתחלה, מהאמצע, ומהסוף. אל תיצור כל השאלות מהחלקים הראשונים!

חשוב מאוד: כל שאלה חייבת לכלול הפניה מדויקת שנמצאה ישירות מהקובץ. אל תמציא הפניות. ההפניה חייבת להיות מדויקת ומבוססת על התוכן בפועל בקבצי ה-PDF.

אל תקצר תהליכים - לכל שאלה בנפרד, חפש את ההפניה, וודא שהיא תואמת לנושא השאלה, ורק אז צור את השאלה. ההפניה חייבת להיות רלוונטית ישירות לנושא השאלה. אם השאלה על 'גילוי מידע מהותי', ההפניה חייבת להיות לסעיף שמדבר על 'גילוי מידע מהותי'.

כל ההפניות חייבות להיות לחלק 1 של הספר בפורמט: "[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ." או "[שם החוק/התקנה המלא עם שנה] מתחילות בעמ' Y בקובץ."

חשוב מאוד: אל תפנה ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17. תקנות אלו אינן רלוונטיות ליצירת שאלות. השתמש רק בחוקים ותקנות אחרים.

חשוב מאוד - חובה מוחלטת: קרא את כל התוכן בקבצי ה-PDF, לא רק חלקים מסוימים. ודא שאתה מבין את כל הנושאים המשפטיים בספר לפני יצירת שאלות. עבור על כל הפרקים והנושאים בספר, וודא שהשאלות מכסות נושאים מגוונים. השתמש בכלי file_search כדי לחפש בכל חלקי הספר, לא רק בחלקים הראשונים.

חשוב מאוד - חובה מוחלטת: אל תיצור כל השאלות מהחלקים הראשונים של הספר! ודא שהשאלות מכסות את כל חלקי הספר - מההתחלה, מהאמצע, ומהסוף. השתמש בכלי file_search כדי לחפש נושאים בחלקים שונים של הספר:
- חלק 1: עמודים 1-50 (מתווכים, חוקים בסיסיים)
- חלק 1: עמודים 51-100 (הגנת הצרכן, חוזים, מכר דירות)
- חלק 1: עמודים 101-150 (הגנת הדייר, תכנון ובנייה)
- חלק 1: עמודים 151+ (מיסוי מקרקעין, נושאים מתקדמים)
- חלק 2: כל הנושאים הנוספים

חשוב מאוד: לפני יצירת כל שאלה, השתמש בכלי file_search כדי לחפש נושאים בחלקים שונים של הספר. אל תתמקד רק בחלקים הראשונים. ודא שהשאלות מכסות נושאים מכל חלקי הספר - מההתחלה, מהאמצע, ומהסוף.

חשוב מאוד - חובה מוחלטת: צור שאלות על נושאים מגוונים מהספר. אל תיצור כל השאלות על אותו נושא. כל שאלה חייבת להיות על נושא שונה מהשאלות הקודמות. ודא שהשאלות מכסות נושאים שונים כמו: מתווכים, הגנת הצרכן, חוזים, מקרקעין, מכר דירות, הגנת הדייר, תכנון ובנייה, מיסוי מקרקעין, ועוד. פרס את השאלות על פני נושאים שונים כדי לספק כיסוי מקיף של החומר.

חשוב מאוד - חובה: לפני יצירת כל שאלה, בדוק את הנושאים של השאלות שכבר יצרת. וודא שהשאלה החדשה היא על נושא שונה לחלוטין מהשאלות הקודמות. אם כבר יצרת שאלה על "מתווכים", אל תיצור עוד שאלה על "מתווכים" - בחר נושא אחר כמו "הגנת הצרכן" או "מכר דירות". כל שאלה חייבת להיות על נושא ייחודי שלא הופיע בשאלות הקודמות.

החזר את השאלות ב-JSON בלבד, ללא טקסט נוסף.`,
        tools: pdfAttachment.vectorStoreIds.length > 0 ? [{ type: 'file_search' }] : [],
        tool_resources: pdfAttachment.vectorStoreIds.length > 0
          ? {
              file_search: {
                vector_store_ids: pdfAttachment.vectorStoreIds
              }
            }
          : undefined
      });
      
      // Create a Thread
      const thread = await openai.beta.threads.create();
      
      // Add user message with the question
      await openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: prompt
      });
      
      // Run the Assistant
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id
      });
      
      // Wait for the run to complete
      let runStatus = run.status;
      let waitCount = 0;
      const maxWaitTime = 120; // 2 minutes timeout
      while ((runStatus === 'queued' || runStatus === 'in_progress') && waitCount < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const runInfo = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        runStatus = runInfo.status;
        waitCount++;
        if (runStatus === 'failed' || runStatus === 'cancelled') {
          throw new Error(`Assistant run ${runStatus}`);
        }
      }
      
      if (waitCount >= maxWaitTime) {
        throw new Error('Assistant run timeout');
      }
      
      // Retrieve the assistant's response
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant');
      
      if (!assistantMessage || !assistantMessage.content[0] || assistantMessage.content[0].type !== 'text') {
        throw new Error('No response from assistant');
      }
      
      const content = assistantMessage.content[0].text.value;
      
      // Cleanup
      try {
        await openai.beta.assistants.del(assistant.id);
        await pdfAttachment.cleanup();
      } catch (cleanupError) {
        console.warn('Failed to cleanup assistant and files:', cleanupError);
      }
      
      // Parse JSON response
      let parsed: any;
      try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          parsed = JSON.parse(content);
        }
      } catch (e) {
        throw new Error('Invalid JSON response from OpenAI Assistant');
      }
      
      // Handle both array and object with questions array
      const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);
      
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Invalid response format from OpenAI - no questions found');
      }
      
      // Randomize options for each question and ensure bookReference
      const { getBookReferenceByAI } = await import('./bookReferenceService');
      
      const processedQuestions = await Promise.all(questions.map(async (q) => {
        const correctAnswerText = q.options[q.correctAnswerIndex];
        const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
        const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
        
        // Use bookReference from AI if provided, validate it matches the question
        let bookReference = q.bookReference;
        if (!bookReference || bookReference.trim() === '') {
          console.warn('Warning: AI did not provide book reference during generation, using fallback for question:', q.question.substring(0, 50));
          try {
            bookReference = await getBookReferenceByAI(q.question, undefined, documentContent);
          } catch (error) {
            console.warn('Failed to get book reference for question:', error);
            bookReference = 'חלק 1';
          }
        } else {
          // Validate that the reference matches the question topic
          const { validateReferenceMatchesQuestion } = await import('./bookReferenceService');
          const validation = validateReferenceMatchesQuestion(q.question, bookReference);
          if (!validation.isValid) {
            console.warn('Warning: Book reference does not match question topic:', {
              question: q.question.substring(0, 50),
              reference: bookReference,
              reason: validation.reason,
              suggested: validation.suggestedReference
            });
            // Try to get correct reference
            if (validation.suggestedReference) {
              bookReference = validation.suggestedReference;
            } else {
              try {
                bookReference = await getBookReferenceByAI(q.question, undefined, documentContent);
              } catch (error) {
                console.warn('Failed to get correct book reference for question:', error);
                // Keep original reference but log warning
              }
            }
          }
        }
        
        return {
          ...q,
          options: shuffledOptions,
          correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0,
          bookReference
        };
      }));
      
      // Ensure topic diversity - filter out questions with duplicate topics
      const { categorizeQuestionByTopic } = await import('./topicTrackingService');
      const topicMap = new Map<string, QuizQuestion[]>();
      
      // Categorize all questions by topic
      for (const question of processedQuestions) {
        try {
          const topic = await categorizeQuestionByTopic(question.question, documentContent || '');
          if (!topicMap.has(topic)) {
            topicMap.set(topic, []);
          }
          topicMap.get(topic)!.push(question);
        } catch (error) {
          console.warn('Failed to categorize question by topic:', error);
          // If categorization fails, keep the question
          if (!topicMap.has('נושא כללי')) {
            topicMap.set('נושא כללי', []);
          }
          topicMap.get('נושא כללי')!.push(question);
        }
      }
      
      // Filter to ensure diversity: max 2 questions per topic (or 1 if count < 10)
      const maxPerTopic = count < 10 ? 1 : 2;
      const diverseQuestions: QuizQuestion[] = [];
      const usedTopics = new Set<string>();
      
      // First pass: add one question from each topic
      for (const [topic, topicQuestions] of topicMap.entries()) {
        if (topicQuestions.length > 0 && diverseQuestions.length < count) {
          const question = topicQuestions[0];
          diverseQuestions.push(question);
          usedTopics.add(topic);
        }
      }
      
      // Second pass: add more questions from different topics (up to maxPerTopic per topic)
      for (const [topic, topicQuestions] of topicMap.entries()) {
        if (diverseQuestions.length >= count) break;
        const currentCount = diverseQuestions.filter(q => {
          try {
            // Check if question belongs to this topic (simplified check)
            return topicQuestions.includes(q);
          } catch {
            return false;
          }
        }).length;
        
        if (currentCount < maxPerTopic && topicQuestions.length > currentCount) {
          const additionalQuestion = topicQuestions[currentCount];
          if (additionalQuestion && !diverseQuestions.includes(additionalQuestion)) {
            diverseQuestions.push(additionalQuestion);
          }
        }
      }
      
      // If we don't have enough questions, add remaining ones (even if same topic)
      if (diverseQuestions.length < count) {
        for (const question of processedQuestions) {
          if (diverseQuestions.length >= count) break;
          if (!diverseQuestions.includes(question)) {
            diverseQuestions.push(question);
          }
        }
      }
      
      // Shuffle to mix topics
      return diverseQuestions.sort(() => Math.random() - 0.5).slice(0, count);
    } catch (assistantsError) {
      console.warn('Failed to use Assistants API, falling back to chat completions:', assistantsError);
      if (pdfAttachment) {
        try {
          await pdfAttachment.cleanup();
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
      // Fall through to chat completions
    }
  }
  
  // Fallback to chat completions (with or without documentContent)
  // TABLE_OF_CONTENTS is already imported at the top of the function
  const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא ליצור סט חדש של בדיוק ${count} שאלות ייחודיות בפורמט מבחן אמריקאי. ${documentContent ? `השאלות צריכות להיות דומות בסגנון ובדרגת קושי למבחנים קודמים שמופיעים במסמך המצורף.` : `השאלות צריכות לבחון את העקרונות המשפטיים המרכזיים בתחום התיווך במקרקעין בישראל.`} השאלות החדשות צריכות לבחון את אותם עקרונות משפטיים מרכזיים אך להציג אותם בתרחישים חדשים. לכל שאלה, ספק ארבע אפשרויות תשובה, את האינדקס של התשובה הנכונה, והסבר קצר במיוחד, בן משפט אחד בלבד. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חשוב ביותר: חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (כלומר, ללא כוכביות **). ${documentContent ? `אל תעתיק או תנסח מחדש שאלות מהמסמך שסופק.` : ''} כל התוכן חייב להיות בעברית.

${documentContent ? `המסמך המכיל מבחנים קודמים הוא:
---
${documentContent}
---` : ''}

הספרים מצורפים כקבצי PDF לניתוח זה.

תוכן העניינים של הספר "חלק 1":
---
${TABLE_OF_CONTENTS}
---

תהליך יצירת כל שאלה - חשוב מאוד:
1. לפני יצירת כל שאלה, חפש בקבצי ה-PDF את ההפניה המדויקת (שם החוק/התקנה, מספר הסעיף, ומספר העמוד).
2. פתח את קישורי ה-PDF המצורפים, חפש את הנושא המשפטי הרלוונטי, וקרא את הטקסט הרלוונטי.
3. זהה את הסעיף המדויק ואת מספר העמוד מהקובץ (חלק 1 בלבד).
4. וודא שההפניה לספר תואמת בדיוק לנושא השאלה שאתה עומד ליצור. חפש את הנושא הספציפי של השאלה בקבצי ה-PDF, וזהה את ההפניה המדויקת לנושא הזה בלבד.
5. רק לאחר שמצאת את ההפניה המדויקת מהקובץ ווידאת שהיא תואמת לנושא השאלה, צור את השאלה המבוססת על התוכן הזה.

חשוב מאוד: כל שאלה חייבת לכלול הפניה מדויקת שנמצאה ישירות מהקובץ. אל תמציא הפניות. ההפניה חייבת להיות מדויקת ומבוססת על התוכן בפועל בקבצי ה-PDF. כל ההפניות חייבות להיות לחלק 1 של הספר בלבד, גם אם הנושא מופיע גם בחלק 2.

חשוב מאוד: קרא את כל התוכן בקבצי ה-PDF, לא רק חלקים מסוימים. ודא שאתה מבין את כל הנושאים המשפטיים בספר לפני יצירת שאלות. עבור על כל הפרקים והנושאים בספר, וודא שהשאלות מכסות נושאים מגוונים. פתח את קישורי ה-PDF המצורפים וקרא את כל התוכן, לא רק חלקים מסוימים.

חשוב מאוד: צור שאלות על נושאים מגוונים מהספר. אל תיצור כל השאלות על אותו נושא. ודא שהשאלות מכסות נושאים שונים כמו: מתווכים, הגנת הצרכן, חוזים, מקרקעין, מכר דירות, הגנת הדייר, תכנון ובנייה, מיסוי מקרקעין, ועוד. פרס את השאלות על פני נושאים שונים כדי לספק כיסוי מקיף של החומר.

אל תקצר תהליכים - לכל שאלה בנפרד, חפש את ההפניה, וודא שהיא תואמת לנושא השאלה, ורק אז צור את השאלה. ההפניה חייבת להיות רלוונטית ישירות לנושא השאלה. אם השאלה על 'גילוי מידע מהותי', ההפניה חייבת להיות לסעיף שמדבר על 'גילוי מידע מהותי'.

הוראות להפניה לספר:
1. ניתוח את נושא השאלה וזהה את הנושא המרכזי
2. פתח את קישור ה-PDF של חלק 1, חפש את הנושא, וקרא את הטקסט הרלוונטי
3. זהה את שם החוק/התקנה המלא עם השנה, את מספר הסעיף המדויק, ואת מספר העמוד מהקובץ
4. לכל שאלה, ספק הפניה לספר בפורמט: "[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ." או "[שם החוק/התקנה המלא עם שנה] מתחילות בעמ' Y בקובץ."
5. חשוב מאוד: אל תפנה ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17. תקנות אלו אינן רלוונטיות ליצירת שאלות. השתמש רק בחוקים ותקנות אחרים.
6. אל תכלול הפניות ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17.
7. חשוב מאוד: חוק המתווכים במקרקעין, התשנ"ו–1996 מופיע בעמודים 1-2, לא בעמוד 15. אל תפנה לחוק זה בעמוד 15. עמוד 15 מכיל תקנות, לא את החוק עצמו.

השב ב-JSON בלבד בפורמט הבא:
[
  {
    "question": "שאלה",
    "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
    "correctAnswerIndex": 0,
    "explanation": "הסבר קצר",
    "bookReference": "[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ."
  }
]`;

  const response = await openai.responses.create({
    model: openAIModel,
    instructions: 'אתה עוזר מומחה ביצירת שאלות למבחן. לפני יצירת כל שאלה, חפש את הנושא בקבצי ה-PDF, מצא את ההפניה המדויקת, וודא שההפניה תואמת לנושא השאלה שאתה עומד ליצור, ורק אז צור את השאלה עם ההפניה המתאימה. אתה תמיד מחזיר JSON בפורמט הבא: {"questions": [{"question": "...", "options": ["...", "..."], "correctAnswerIndex": 0, "explanation": "...", "bookReference": "[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ\' Y בקובץ."}]} ללא טקסט נוסף.',
    input: prompt,
    text: {
      format: {
        type: 'json_object'
      }
    },
    temperature: 0.9,
  });

  const content = response.output_text;
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

  // Randomize options for each question and ensure bookReference
  const { getBookReferenceByAI } = await import('./bookReferenceService');
  
  return Promise.all(questions.map(async (q) => {
    const correctAnswerText = q.options[q.correctAnswerIndex];
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
    const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
    
    // Use bookReference from AI if provided, validate it matches the question
    let bookReference = q.bookReference;
    if (!bookReference || bookReference.trim() === '') {
      console.warn('Warning: AI did not provide book reference during generation, using fallback for question:', q.question.substring(0, 50));
      try {
        bookReference = await getBookReferenceByAI(q.question, undefined, documentContent);
      } catch (error) {
        console.warn('Failed to get book reference for question:', error);
        bookReference = 'חלק 1';
      }
    } else {
      // Validate that the reference matches the question topic
      const { validateReferenceMatchesQuestion } = await import('./bookReferenceService');
      const validation = validateReferenceMatchesQuestion(q.question, bookReference);
      if (!validation.isValid) {
        console.warn('Warning: Book reference does not match question topic:', {
          question: q.question.substring(0, 50),
          reference: bookReference,
          reason: validation.reason,
          suggested: validation.suggestedReference
        });
        // Try to get correct reference
        if (validation.suggestedReference) {
          bookReference = validation.suggestedReference;
        } else {
          try {
            bookReference = await getBookReferenceByAI(q.question, undefined, documentContent);
          } catch (error) {
            console.warn('Failed to get correct book reference for question:', error);
            // Keep original reference but log warning
          }
        }
      }
    }
    
    return {
      ...q,
      options: shuffledOptions,
      correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0,
      bookReference
    };
  }));
}

// Quiz generation with Gemini (fallback)
async function generateQuizGemini(documentContent?: string, count: number = 10): Promise<QuizQuestion[]> {
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

/**
 * Generate quiz using retrieval-first approach
 * Retrieves relevant blocks from database, then generates questions from retrieved blocks only
 */
async function generateQuizWithRetrieval(count: number = 10): Promise<QuizQuestion[]> {
  try {
    // Import Supabase client
    const { supabase } = await import('./authService');
    
    // Early check: Try one retrieval call to see if circuit breaker is open
    // If it is, immediately fall back to regular generation instead of trying all questions
    try {
      const { invokeRetrieveBlocks } = await import('./bookReferenceService');
      await invokeRetrieveBlocks(
        'חוקים ותקנות בנושא מתווכים במקרקעין',
        'part1',
        3
      );
    } catch (err: any) {
      // If circuit breaker is open, immediately fall back
      if (err?.message?.includes('Circuit breaker')) {
        throw new Error('Circuit breaker is open: retrieve-blocks service is unavailable');
      }
      // For other errors on first call, we'll still try (might be transient)
    }
    
    const questions: QuizQuestion[] = [];
    
    // Generate questions one at a time to ensure each has proper citation
    // Add delay between calls to reduce load
    for (let i = 0; i < count; i++) {
      try {
        // Add delay between calls to reduce load on retrieve-blocks
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between calls
        }

        // Step 1: Retrieve relevant blocks (without a specific question, we'll use a general query)
        // Use the cached helper function which includes retry logic, caching, and circuit breaker
        let retrieveData: any = null;
        let retrieveError: any = null;
        
        try {
          const { invokeRetrieveBlocks } = await import('./bookReferenceService');
          retrieveData = await invokeRetrieveBlocks(
            'חוקים ותקנות בנושא מתווכים במקרקעין',
            'part1',
            3 // Fewer blocks per question for focused generation
          );
        } catch (err: any) {
          retrieveError = err;
          // Check if circuit breaker is open
          if (err?.message?.includes('Circuit breaker')) {
            // If circuit breaker opens during generation, throw to trigger fallback
            throw new Error('Circuit breaker opened during generation: retrieve-blocks service is unavailable');
          }
        }

        if (retrieveError || !retrieveData || !retrieveData.blocks || retrieveData.blocks.length === 0) {
          console.warn(`Failed to retrieve blocks for question ${i + 1}, skipping...`, retrieveError);
          continue;
        }

        const blocks = retrieveData.blocks;
        
        // Step 2: Generate question from retrieved blocks using OpenAI
        const blockTexts = blocks.map((b: any) => `[page ${b.page_number} | block ${b.block_id}]\n${b.text}`).join('\n\n');
        
        const openai = await getOpenAI();
        const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל.

חשוב מאוד - חובה מוחלטת: כל השאלות חייבות להיות מבוססות אך ורק על התוכן ב-CONTEXT שסופק. אסור לך ליצור שאלות על בסיס ידע כללי או מידע שלא מופיע ב-CONTEXT.

CONTEXT (רק הטקסט הזה):
${blockTexts}

צור שאלה אחת בעברית בפורמט מבחן אמריקאי על בסיס התוכן ב-CONTEXT בלבד. השאלה חייבת להיות מבוססת על תוכן ספציפי שקראת ב-CONTEXT.

החזר JSON בפורמט:
{
  "question": "טקסט השאלה",
  "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
  "correctAnswerIndex": 0,
  "explanation": "הסבר קצר למה התשובה נכונה",
  "bookReference": "הפניה לספר בפורמט: [שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ."
}

חשוב: bookReference חייב להיות מבוסס על העמודים והבלוקים ב-CONTEXT. השתמש בעמודים מהבלוקים שסופקו.`;

        const response = await openai.responses.create({
          model: 'gpt-4o-mini',
          instructions: 'אתה מומחה ביצירת שאלות למבחן. אתה תמיד מחזיר JSON בלבד ללא טקסט נוסף.',
          input: prompt,
          temperature: 0.3,
          text: {
            format: {
              type: 'json_object'
            }
          },
        });

        const content = response.output_text;
        if (!content) {
          console.warn(`No response for question ${i + 1}, skipping...`);
          continue;
        }

        const questionData = JSON.parse(content);
        
        // Step 3: Validate and format question
        if (!questionData.question || !questionData.options || questionData.options.length !== 4) {
          console.warn(`Invalid question structure for question ${i + 1}, skipping...`);
          continue;
        }

        // Step 4: Generate or validate book reference
        let bookReference = questionData.bookReference;
        if (!bookReference || bookReference.trim() === '') {
          // Try to generate reference using OpenAI first (via getBookReferenceByAI)
          try {
            const { getBookReferenceByAI } = await import('./bookReferenceService');
            bookReference = await getBookReferenceByAI(questionData.question);
          } catch (refError) {
            console.warn(`Failed to generate reference for question ${i + 1}:`, refError);
            // Use a fallback reference based on the blocks
            const firstBlock = blocks[0];
            bookReference = `חלק 1 – עמ' ${firstBlock.page_number} בקובץ.`;
          }
        }

        questions.push({
          question: questionData.question,
          options: questionData.options,
          correctAnswerIndex: questionData.correctAnswerIndex || 0,
          explanation: questionData.explanation || '',
          bookReference: bookReference,
        });
      } catch (error) {
        console.warn(`Error generating question ${i + 1}:`, error);
        // Continue to next question
      }
    }

    if (questions.length === 0) {
      throw new Error('Failed to generate any questions');
    }

    return questions;
  } catch (error) {
    console.warn('Retrieval-based quiz generation failed:', error);
    throw error;
  }
}

export async function generateQuiz(documentContent?: string, count: number = 10): Promise<QuizQuestion[]> {
  // Try retrieval-first approach
  try {
    return await generateQuizWithRetrieval(count);
  } catch (error: any) {
    // Check if the error is due to circuit breaker being open (service unavailable)
    if (error?.message?.includes('Circuit breaker')) {
      console.warn('retrieve-blocks service is unavailable (circuit breaker open), skipping retrieval-based generation');
      // Skip retrieval entirely and use direct AI generation
      return tryWithFallback(
        () => generateQuizOpenAI(documentContent, count),
        () => generateQuizGemini(documentContent, count),
        "נכשל ביצירת שאלות הבוחן."
      );
    }
    
    console.warn('Retrieval-based generation failed, falling back to AI:', error);
    // Fallback to existing AI-based approach
    // Try OpenAI first, then fallback to Gemini
    return tryWithFallback(
      () => generateQuizOpenAI(documentContent, count),
      () => generateQuizGemini(documentContent, count),
      "נכשל ביצירת שאלות הבוחן."
    );
  }
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

    const response = await openai.responses.create({
      model: openAIModel,
      instructions: 'אתה עוזר מומחה. אתה תמיד מחזיר JSON בלבד, ללא טקסט נוסף.',
      input: prompt,
      text: {
        format: {
          type: 'json_object'
        }
      },
      temperature: 0.3,
    });

    const content = response.output_text;
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
async function generateFlashcardsOpenAI(documentContent?: string, count: number = 10): Promise<Flashcard[]> {
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

  const response = await openai.responses.create({
    model: openAIModel,
    instructions: 'אתה עוזר מומחה ביצירת כרטיסיות לימוד. אתה תמיד מחזיר JSON בפורמט הבא: {"flashcards": [{"question": "...", "answer": "..."}]} ללא טקסט נוסף.',
    input: prompt,
    text: {
      format: {
        type: 'json_object'
      }
    },
    temperature: 0.9, // Higher temperature for more variety in flashcards
  });

  const content = response.output_text;
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
async function generateFlashcardsGemini(documentContent?: string, count: number = 10): Promise<Flashcard[]> {
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

export async function generateFlashcards(documentContent?: string, count: number = 10): Promise<Flashcard[]> {
  // Try Gemini first, then fallback to OpenAI
  return tryWithFallback(
    () => generateFlashcardsGemini(documentContent, count),
    () => generateFlashcardsOpenAI(documentContent, count),
    "נכשל ביצירת כרטיסיות."
  );
}

// Create OpenAI chat session (primary)
function createChatSessionOpenAI(documentContent: string, userName?: string): any {
  const name = userName || 'חבר';
  const systemInstruction = `אתה דניאל, מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. אתה מדבר בצורה טבעית ושיחה, כמו דיבור עם חבר. הידע שלך מבוסס באופן בלעדי על המסמך שסופק. דבר בגובה העיניים ובאופן ישיר וחם. אל תשתמש בשם המשתמש בכל תשובה - השתמש בו רק לעיתים רחוקות, כשרלוונטי. תשובותיך חייבות להיות קצרות מאוד ותמציתיות. הימנע מהסברים ארוכים. חשוב ביותר: אל תשתמש בשום פנים ואופן בעיצוב טקסט כמו הדגשה (ללא **). 

חשוב מאוד - הגבלות נוקשות:
- ענה רק על שאלות הקשורות ישירות לחוקי מקרקעין בישראל, למבחן הרישוי למתווכי מקרקעין, ולשאלות הבחינה.
- הנושאים המורשים בלבד: דמי תיווך, הערת אזהרה, בלעדיות, זכויות וחובות מתווכים, הסכמים, רישוי מתווכים, חוק המקרקעין, חוק המתווכים, שאלות מהבחינות, והחומר הנלמד במבחן הרישוי.
- אם ${name} שואל שאלה שאינה קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות, או כל נושא אחר), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."
- אין לענות על שאלות שאינן קשורות למבחן התיווך ולחוקי המקרקעין, גם אם הן נראות מעניינות.
- אם התשובה לא נמצאת במסמך, ציין זאת בבירור ונסה להשיב על בסיס הידע הכללי מהמסמך.

ענה על שאלות, הבהר מושגים ועזור להבין את החומר הנלמד מהבחינות. דבר בצורה טבעית ושיחה. אל תשאל בכל תשובה "רוצה שאסביר עוד?" או "יש לך שאלות נוספות?" - פשוט תן את המידע בצורה טבעית. אם יש צורך להרחיב, פשוט הרחב. השב תמיד בעברית. המסמך לעיונך:

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
  const systemInstruction = `אתה דניאל, מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. אתה מדבר בצורה טבעית ושיחה, כמו דיבור עם חבר. הידע שלך מבוסס באופן בלעדי על המסמך שסופק. דבר בגובה העיניים ובאופן ישיר וחם. אל תשתמש בשם המשתמש בכל תשובה - השתמש בו רק לעיתים רחוקות, כשרלוונטי. תשובותיך חייבות להיות קצרות מאוד ותמציתיות. הימנע מהסברים ארוכים. חשוב ביותר: אל תשתמש בשום פנים ואופן בעיצוב טקסט כמו הדגשה (ללא **). 

חשוב מאוד - הגבלות נוקשות:
- ענה רק על שאלות הקשורות ישירות לחוקי מקרקעין בישראל, למבחן הרישוי למתווכי מקרקעין, ולשאלות הבחינה.
- הנושאים המורשים בלבד: דמי תיווך, הערת אזהרה, בלעדיות, זכויות וחובות מתווכים, הסכמים, רישוי מתווכים, חוק המקרקעין, חוק המתווכים, שאלות מהבחינות, והחומר הנלמד במבחן הרישוי.
- אם ${name} שואל שאלה שאינה קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות, או כל נושא אחר), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."
- אין לענות על שאלות שאינן קשורות למבחן התיווך ולחוקי המקרקעין, גם אם הן נראות מעניינות.
- אם התשובה לא נמצאת במסמך, ציין זאת בבירור ונסה להשיב על בסיס הידע הכללי מהמסמך.

ענה על שאלות, הבהר מושגים ועזור להבין את החומר הנלמד מהבחינות. דבר בצורה טבעית ושיחה. אל תשאל בכל תשובה "רוצה שאסביר עוד?" או "יש לך שאלות נוספות?" - פשוט תן את המידע בצורה טבעית. אם יש צורך להרחיב, פשוט הרחב. השב תמיד בעברית. המסמך לעיונך:

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
  const systemInstruction = `אתה דניאל, מורה פרטי מומחה למבחן התיווך הישראלי. אתה מדבר עם ${name}. הידע שלך מבוסס באופן בלעדי על חומר הלימוד שסופק. ${name} ביקש הסבר נוסף על שאלה מהמבחן:

---
${context}
---

**חשוב מאוד - זהו הסבר על שאלה מהמבחן הרישוי למתווכי מקרקעין:**
- כל השאלות של ${name} יהיו קשורות לשאלה זו, לנושא שנלמד, או לחוקי מקרקעין בישראל ולמבחן הרישוי.
- ענה על כל שאלה של ${name} בהרחבה - הן על השאלה הספציפית, על הנושאים הקשורים, על חוקי מקרקעין, ועל כל נושא הקשור למבחן הרישוי למתווכי מקרקעין.
- רק אם ${name} שואל שאלה שאינה קשורה כלל לחוקי מקרקעין או למבחן (למשל: מתמטיקה כללית, היסטוריה, פוליטיקה, חדשות), ענה: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."

הסבר את הנושא בצורה ברורה ותמציתית ביותר. השתמש בשפה פשוטה ושיחה, כמו דיבור עם חבר. אל תשתמש בשם המשתמש בכל תשובה - השתמש בו רק לעיתים רחוקות, כשרלוונטי. אל תשאל בכל תשובה "רוצה שאסביר עוד?" או "יש לך שאלות נוספות?" - פשוט תן את המידע בצורה טבעית. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד הדגשה (ללא **). התשובה צריכה להיות קצרה וישירה. השב תמיד בעברית.

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
  const systemInstruction = `אתה דניאל, מורה פרטי מומחה למבחן התיווך הישראלי. אתה מדבר עם ${name}. הידע שלך מבוסס באופן בלעדי על חומר הלימוד שסופק. ${name} ביקש הסבר נוסף על שאלה מהמבחן:

---
${context}
---

**חשוב מאוד - זהו הסבר על שאלה מהמבחן הרישוי למתווכי מקרקעין:**
- כל השאלות של ${name} יהיו קשורות לשאלה זו, לנושא שנלמד, או לחוקי מקרקעין בישראל ולמבחן הרישוי.
- ענה על כל שאלה של ${name} בהרחבה - הן על השאלה הספציפית, על הנושאים הקשורים, על חוקי מקרקעין, ועל כל נושא הקשור למבחן הרישוי למתווכי מקרקעין.
- רק אם ${name} שואל שאלה שאינה קשורה כלל לחוקי מקרקעין או למבחן (למשל: מתמטיקה כללית, היסטוריה, פוליטיקה, חדשות), ענה: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."

הסבר את הנושא בצורה ברורה ותמציתית ביותר. השתמש בשפה פשוטה ושיחה, כמו דיבור עם חבר. אל תשתמש בשם המשתמש בכל תשובה - השתמש בו רק לעיתים רחוקות, כשרלוונטי. אל תשאל בכל תשובה "רוצה שאסביר עוד?" או "יש לך שאלות נוספות?" - פשוט תן את המידע בצורה טבעית. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד הדגשה (ללא **). התשובה צריכה להיות קצרה וישירה. השב תמיד בעברית.

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
  try {
    return await tryWithFallback(
    async () => {
      // OpenAI implementation
      const openai = await getOpenAI();
      
      const response = await openai.responses.create({
        model: openAIModel,
        instructions: `אתה מורה מקצועי ומנוסה לניתוח ביצועים במבחן הרישוי למתווכי מקרקעין בישראל. תפקידך לספק משוב מפורט ומעודד ישירות למשתמש.

**חשוב מאוד - כתוב בגוף שני, לא בגוף שלישי:**
- תמיד החזר JSON עם strengths, weaknesses, ו-recommendations
- strengths: רשימה של עד 3 נושאים שבהם המשתמש מפגין הבנה טובה, עם הסבר קצר לכל נושא בגוף שני (אתה/לך/שלך) מדוע זה חוזקה. אם אין תשובות נכונות, החזר רשימה ריקה.
- weaknesses: רשימה של עד 3 נושאים שבהם המשתמש מתקשה, עם הסבר קצר לכל נושא בגוף שני (אתה/לך/עליך) מה הבעיה ומה צריך לשפר. אם כל התשובות נכונות, החזר רשימה ריקה.
- recommendations: המלצה תמציתית ומעשית כתובה בגוף שני (אתה/לך/עליך), מבוססת על החולשות. אם אין חולשות, ספק המלצה כללית.
- **כל הטקסט חייב להיות בגוף שני (אתה/לך/עליך/שלך), לא בגוף שלישי (המשתמש/הוא/שלו)**
- כל התוכן בעברית.`,
        input: prompt,
        text: {
          format: {
            type: 'json_object'
          }
        },
        temperature: 0.5, // Slightly higher for more detailed explanations
      });

      const content = response.output_text?.trim();
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

      const analysisResult = {
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        recommendations: parsed.recommendations || '',
      } as AnalysisResult;
      
      return analysisResult;
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
      const analysisResult = JSON.parse(cleanedText) as AnalysisResult;
      
      return analysisResult;
    },
    "נכשל בניתוח התוצאות."
    );
  } catch (error: any) {
    // If both OpenAI and Gemini fail (e.g., API keys not configured), return a basic analysis
    const errorMsg = error?.message || String(error) || '';
    const isMissingKeys = errorMsg.includes('not configured') || 
                         errorMsg.includes('API_KEY') ||
                         errorMsg.includes('AI services are not configured');
    
    if (isMissingKeys) {
      console.error('AI services not configured, returning basic analysis. Error:', errorMsg);
      console.error('This means API keys are not being read. Check:');
      console.error('1. .env.local file exists and has VITE_OPENAI_API_KEY and VITE_GEMINI_API_KEY');
      console.error('2. Dev server was restarted after updating .env.local');
      console.error('3. Check console for "Local dev - OpenAI key check" and "Local dev - Gemini key check" logs');
      
      // Return a basic analysis based on results
      const correctCount = correctResults.length;
      const totalCount = results.length;
      const incorrectCount = incorrectResults.length;
      const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      
      const strengths: string[] = [];
      const weaknesses: string[] = [];
      let recommendations = '';
      
      if (correctCount > 0) {
        strengths.push(`ענית נכון על ${correctCount} מתוך ${totalCount} שאלות, מה שמעיד על הבנה טובה שלך בחלק מהנושאים`);
      }
      
      if (incorrectCount > 0) {
        weaknesses.push(`ענית לא נכון על ${incorrectCount} מתוך ${totalCount} שאלות, מה שמעיד על צורך בשיפור בחלק מהנושאים`);
        recommendations = `מומלץ לך לחזור על החומר, להתמקד בנושאים שבהם טעית, ולעשות בוחנים נוספים כדי לשפר את הביצועים שלך.`;
      } else {
        recommendations = `כל התשובות שלך נכונות! המשך כך והמשך לתרגל כדי לשמור על הרמה הגבוהה.`;
      }
      
      if (percentage >= 80) {
        strengths.push(`הציון שלך הוא ${percentage}%, מה שמעיד על רמה טובה`);
      } else if (percentage < 60) {
        weaknesses.push(`הציון שלך הוא ${percentage}%, מה שמעיד על צורך בשיפור`);
      }
      
      return {
        strengths: strengths.length > 0 ? strengths : [],
        weaknesses: weaknesses.length > 0 ? weaknesses : [],
        recommendations: recommendations || 'מומלץ לך להמשיך לתרגל ולחזור על החומר כדי לשפר את הביצועים שלך.',
      };
    }
    
    // Re-throw other errors
    throw error;
  }
}

// Continue chat with OpenAI
async function continueChatOpenAI(chat: any, message: string, history: ChatMessage[]): Promise<string> {
  const openai = await getOpenAI();
  
  // Enhance system instruction with topic restriction reminder
  // For explanation chat sessions, the context is always a quiz question, so be more permissive
  const isExplanationChat = chat.context && (chat.context.includes('שאלה:') || chat.context.includes('תשובה נכונה:'));
  
  const enhancedSystemInstruction = isExplanationChat 
    ? `${chat.systemInstruction}

תזכורת חשובה: זהו הסבר על שאלה מהמבחן הרישוי למתווכי מקרקעין. כל השאלות של המשתמש יהיו קשורות לשאלה זו, לנושא שנלמד, או לחוקי מקרקעין. ענה על כל שאלה בהרחבה - הן על השאלה הספציפית, על הנושאים הקשורים, על חוקי מקרקעין, ועל כל נושא הקשור למבחן הרישוי למתווכי מקרקעין. אל תשאל "רוצה שאסביר עוד?" - פשוט תן את המידע בצורה טבעית. רק אם השאלה לא קשורה כלל לחוקי מקרקעין או למבחן (למשל: מתמטיקה כללית, היסטוריה, פוליטיקה, חדשות), ענה: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."`
    : `${chat.systemInstruction}

תזכורת חשובה: אם ההודעה של המשתמש קשורה לחוקי מקרקעין, למבחן הרישוי למתווכי מקרקעין, לשאלות מהבחינה, או לחומר הלימוד, ענה עליה בהרחבה. אל תשאל "רוצה שאסביר עוד?" - פשוט תן את המידע בצורה טבעית. אם ההודעה לא קשורה ישירות לחוקי מקרקעין או למבחן (למשל: שאלות כלליות, מתמטיקה, היסטוריה, פוליטיקה, חדשות), ענה בדיוק כך: "סליחה, אני יכול לעזור לך רק עם שאלות הקשורות לחוקי מקרקעין ולמבחן הרישוי למתווכי מקרקעין בישראל."`;
  
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
  
  const response = await openai.responses.create({
    model: openAIModel,
    input: messages as any,
    temperature: 0.7,
  });
  
  const content = response.output_text;
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

ספק רמז קצר ומעודן שיעזור להבין את התשובה הנכונה, מבלי לחשוף אותה ישירות. דבר בצורה טבעית ושיחה. אל תשתמש בשם המשתמש. הרמז צריך להיות קצר מאוד (משפט אחד או שניים). השב בעברית.`;

  const response = await openai.responses.create({
    model: openAIModel,
    instructions: 'אתה מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. אתה תמיד מחזיר תשובה קצרה ובעברית.',
    input: prompt,
    temperature: 0.7,
  });

  const content = response.output_text;
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

ספק רמז קצר ומעודן שיעזור להבין את התשובה הנכונה, מבלי לחשוף אותה ישירות. דבר בצורה טבעית ושיחה. אל תשתמש בשם המשתמש. הרמז צריך להיות קצר מאוד (משפט אחד או שניים). השב בעברית.`;

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

/**
 * Generate teacher reaction message based on quiz performance
 * Small encouraging message from the teacher
 */
export async function generateTeacherReaction(
  isCorrect: boolean,
  currentScore: number,
  totalQuestions: number,
  recentStreak: number,
  userName?: string,
  question?: string,
  selectedAnswer?: string,
  correctAnswer?: string,
  explanation?: string
): Promise<string> {
  const name = userName || 'אתה';
  const percentage = totalQuestions > 0 ? Math.round((currentScore / totalQuestions) * 100) : 0;
  const isDoingWell = percentage >= 70;
  
  const questionContext = question ? `\n\nשאלה: ${question}` : '';
  const answerContext = selectedAnswer && correctAnswer ? `\nתשובה שניתנה: ${selectedAnswer}\nתשובה נכונה: ${correctAnswer}` : '';
  const explanationContext = explanation ? `\nהסבר: ${explanation}` : '';
  
  const prompt = `אתה דניאל, מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. אתה מדבר בצורה טבעית ושיחה.

נתונים:
- ${isCorrect ? 'ענה נכון' : 'ענה לא נכון'} על השאלה האחרונה
- ציון נוכחי: ${currentScore}/${totalQuestions} (${percentage}%)
- ${recentStreak > 0 ? `רצף של ${recentStreak} תשובות נכונות` : recentStreak < 0 ? `רצף של ${Math.abs(recentStreak)} תשובות שגויות` : 'אין רצף'}
${questionContext}${answerContext}${explanationContext}

חשוב מאוד:
- דבר בצורה טבעית ושיחה, כמו דיבור עם חבר
- אל תשתמש בשם המשתמש - דבר בגוף שני בצורה טבעית
- אל תשתמש בביטויים גנריים כמו "אל תתייאש", "לא נורא", "כל שגיאה היא הזדמנות", "תמשיך כך"
- התייחס ספציפית לשאלה, לתשובה, ולנושא המשפטי שנלמד
- אם התשובה נכונה - התייחס לנושא הספציפי ולמה שזה מראה על ההבנה
- אם התשובה שגויה - הסבר מה היה נכון ומה הקשר לנושא הנלמד
- הודע קצרה מאוד (מקסימום 2 משפטים, עד 40 מילים)

${isCorrect ? 
  'התלמיד ענה נכון - התייחס לנושא הספציפי של השאלה ומה זה מראה על ההבנה שלו בנושא זה.' :
  'התלמיד ענה לא נכון - הסבר מה היה נכון בנושא הספציפי הזה ומה הקשר לחומר הלימוד. אל תשתמש בביטויים גנריים.'}

דוגמה למה לא לעשות: "אל תתייאש, כל שגיאה היא הזדמנות ללמוד" או "רוצה שאסביר עוד?"
דוגמה למה לעשות: "בנושא דמי תיווך, זכור שדרוש רישיון בתוקף. התנאים הם: רישיון בתוקף, הסכם בכתב, ופירוט התשלום."
`;

  const systemInstruction = 'אתה מורה פרטי ידידותי. אתה תמיד מחזיר הודעות קצרות מאוד (מקסימום 40 מילים), מעודדות וחמות. דבר בצורה טבעית ושיחה, כמו דיבור עם חבר. כתוב בגוף שני, אבל אל תשתמש בשם המשתמש. אל תשאל "רוצה שאסביר עוד?" או "יש לך שאלות נוספות?" - פשוט תן את המידע בצורה טבעית. אל תשתמש בביטויים גנריים כמו "אל תתייאש" או "לא נורא" - התייחס תמיד לנושא הספציפי של השאלה ולחומר הלימוד.';

  // Helper function to filter out unwanted characters
  const filterContent = (content: string): string => {
    const cleanedContent = content
      .split('')
      .filter(char => {
        const code = char.charCodeAt(0);
        // Hebrew: 0x0590-0x05FF
        // English/Latin: 0x0020-0x007F (basic ASCII)
        // Numbers: 0x0030-0x0039
        // Common punctuation: allow common Hebrew/English punctuation
        // Exclude Chinese characters (0x4E00-0x9FFF) and other CJK ranges
        return (
          (code >= 0x0590 && code <= 0x05FF) || // Hebrew
          (code >= 0x0020 && code <= 0x007F) || // Basic ASCII (English, numbers, punctuation)
          (code >= 0x2000 && code <= 0x206F) || // General punctuation
          char === '׳' || char === '״' || char === '־' || char === '׀' // Hebrew punctuation
        ) && !(
          (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs (Chinese)
          (code >= 0x3400 && code <= 0x4DBF) || // CJK Extension A
          (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
          (code >= 0xAC00 && code <= 0xD7AF) // Hangul (Korean)
        );
      })
      .join('')
      .trim();
    
    // If cleaned content is empty or too short, throw error
    if (!cleanedContent || cleanedContent.length < 3) {
      throw new Error('Response contains invalid characters');
    }
    
    return cleanedContent;
  };

  // Try OpenAI first, then fallback to Gemini
  return await tryWithFallback(
    async () => {
      // OpenAI implementation
      const openai = await getOpenAI();
      const response = await openai.responses.create({
        model: openAIModel,
        instructions: systemInstruction,
        input: prompt,
        temperature: 0.8,
        max_output_tokens: 80, // Short messages only
      });

      const content = response.output_text?.trim();
      if (!content) {
        throw new Error('No response from OpenAI');
      }
      
      return filterContent(content);
    },
    async () => {
      // Gemini fallback
      const ai = await getGemini();
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.8,
          maxOutputTokens: 80,
        },
      });

      const content = response.text.trim();
      if (!content) {
        throw new Error('No response from Gemini');
      }
      
      return filterContent(content);
    },
    'נכשל ביצירת תגובת המורה.'
  ).catch(() => {
    // Final fallback to simple predefined messages (avoid generic phrases, no name)
    if (isCorrect) {
      if (isDoingWell) {
        return 'מעולה! הבנת את הנושא הזה היטב.';
      } else {
        return 'תשובה נכונה! נראה שאתה מתקדם בנושא הזה.';
      }
    } else {
      // For incorrect answers, provide topic-specific feedback (no questions)
      const topicHint = question ? 'הנושא הזה חשוב - כדאי לחזור עליו.' : 'כדאי לחזור על הנושא הזה.';
      return topicHint;
    }
  });
}

export async function generateSpeech(textToSpeak: string): Promise<string> {
  // For Hebrew text, try Google Cloud TTS first (neural voices sound human-like)
  // Then fallback to browser TTS, then OpenAI
  // Check if text contains Hebrew characters
  const hasHebrew = /[\u0590-\u05FF]/.test(textToSpeak);
  
  if (hasHebrew) {
    // Try Google Cloud Text-to-Speech first (best quality, human-like neural voices)
    try {
      const { getGoogleCloudTTSKey } = await import('./apiKeysService');
      const apiKey = await getGoogleCloudTTSKey();
      
      if (apiKey) {
        // Use Google Cloud TTS REST API for natural Hebrew voices
        const response = await fetch(
          `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input: { text: textToSpeak },
              voice: {
                languageCode: 'he-IL',
                name: 'he-IL-Wavenet-D', // Neural voice - sounds very natural (female)
                ssmlGender: 'FEMALE'
              },
              audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: 1.0,
                pitch: 0,
                volumeGainDb: 0.0
              }
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Google Cloud TTS API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.audioContent) {
          // Return base64 audio directly
          return data.audioContent;
        } else {
          throw new Error('No audio content in response');
        }
      }
    } catch (googleError) {
      // Google Cloud TTS not available, trying OpenAI TTS
    }
    
    // Try OpenAI TTS with HD model for Hebrew (more natural, even if pronunciation isn't perfect)
    try {
      const openai = await getOpenAI();
      const response = await openai.audio.speech.create({
        model: "tts-1-hd", // HD model for more natural, higher quality speech
        voice: "nova", // Female voice, clear and natural (alternative: "shimmer" for warm tone)
        input: textToSpeak,
        response_format: "mp3",
      });
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
      }
      return btoa(binaryString);
    } catch (openAIError) {
      // OpenAI TTS not available, falling back to browser TTS
    }
    
    // Fallback to browser Web Speech API for Hebrew with better voice selection
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        // Get available voices and find the best Hebrew voice
        return new Promise((resolve, reject) => {
          // Wait for voices to be loaded (they load asynchronously)
          const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            
            // Try to find the best Hebrew voice available
            // Prefer neural/premium voices if available (they sound more natural)
            let hebrewVoice = voices.find(voice => 
              voice.lang.startsWith('he') && 
              (voice.name.toLowerCase().includes('neural') ||
               voice.name.toLowerCase().includes('premium') ||
               voice.name.toLowerCase().includes('enhanced') ||
               voice.name.toLowerCase().includes('female') || 
               voice.name.toLowerCase().includes('woman') ||
               voice.name.toLowerCase().includes('זמרת') ||
               voice.name.toLowerCase().includes('אישה'))
            );
            
            // If no premium Hebrew voice, try any Hebrew voice
            if (!hebrewVoice) {
              hebrewVoice = voices.find(voice => voice.lang.startsWith('he'));
            }
            
            // If still no Hebrew voice, try Israeli voices
            if (!hebrewVoice) {
              hebrewVoice = voices.find(voice => 
                voice.lang.includes('IL') || 
                voice.lang.includes('Israel') ||
                voice.lang.includes('he')
              );
            }
            
            // Log all available Hebrew voices for debugging
            // Create utterance
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = 'he-IL'; // Hebrew (Israel)
            
            // Use better voice if found
            if (hebrewVoice) {
              utterance.voice = hebrewVoice;
            }
            
            // Optimize settings for more natural speech
            // Try different rates and pitches to find what sounds best
            // Higher pitch (1.1-1.2) often sounds more natural, but can vary by voice
            utterance.rate = 0.95; // Slightly faster to reduce mechanical feel
            utterance.pitch = 1.15; // Higher pitch for more natural, less robotic sound
            utterance.volume = 1.0;
            
            // For browser TTS, we return a special marker that will be handled differently
            utterance.onend = () => {
              resolve('browser-tts-success');
            };
            utterance.onerror = (error) => {
              console.error('Browser TTS error:', error);
              reject(new Error('Browser TTS failed'));
            };
            
            window.speechSynthesis.speak(utterance);
          };
          
          // Load voices if they're already available
          if (window.speechSynthesis.getVoices().length > 0) {
            loadVoices();
          } else {
            // Wait for voices to load
            window.speechSynthesis.onvoiceschanged = () => {
              loadVoices();
            };
            
            // Fallback: try loading after a short delay
            setTimeout(() => {
              if (window.speechSynthesis.getVoices().length > 0) {
                loadVoices();
              } else {
                // Use default if voices still not loaded
                const utterance = new SpeechSynthesisUtterance(textToSpeak);
                utterance.lang = 'he-IL';
                utterance.rate = 0.9;
                utterance.pitch = 1.1;
                utterance.onend = () => resolve('browser-tts-success');
                utterance.onerror = () => reject(new Error('Browser TTS failed'));
                window.speechSynthesis.speak(utterance);
              }
            }, 100);
          }
        });
      } else {
        throw new Error("Text-to-speech not supported in this browser");
      }
    } catch (browserError) {
      console.error("Browser TTS failed:", browserError);
      // Final fallback - this should not happen as we already tried OpenAI above
      throw new Error("נכשל ביצירת אודיו. אנא נסה שוב.");
    }
  } else {
    // For non-Hebrew text, try OpenAI first with HD model and natural voice
    try {
      const openai = await getOpenAI();
      const response = await openai.audio.speech.create({
        model: "tts-1-hd", // HD model for more natural, higher quality speech
        voice: "nova", // Female voice, clear and natural (alternative: "shimmer" for warm tone)
        input: textToSpeak,
        response_format: "mp3",
      });
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
      }
      return btoa(binaryString);
    } catch (openAIError) {
      // Fallback to browser TTS
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        return new Promise((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = 'en-US';
          utterance.rate = 0.9;
          utterance.pitch = 1;
          utterance.onend = () => resolve('browser-tts-success');
          utterance.onerror = () => reject(new Error('Browser TTS failed'));
          window.speechSynthesis.speak(utterance);
        });
      }
      throw new Error("נכשל ביצירת אודיו. אנא נסה שוב.");
    }
  }
}

// Targeted flashcard generation with OpenAI
async function generateTargetedFlashcardsOpenAI(weaknesses: string[], documentContent?: string, count: number = 10): Promise<Flashcard[]> {
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

  const response = await openai.responses.create({
    model: openAIModel,
    instructions: 'אתה עוזר מומחה ביצירת כרטיסיות לימוד ממוקדות. אתה תמיד מחזיר JSON בפורמט הבא: {"flashcards": [{"question": "...", "answer": "..."}]} ללא טקסט נוסף.',
    input: prompt,
    text: {
      format: {
        type: 'json_object'
      }
    },
    temperature: 0.9, // Higher temperature for more variety in flashcards
  });

  const content = response.output_text;
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
async function generateTargetedFlashcardsGemini(weaknesses: string[], documentContent?: string, count: number = 10): Promise<Flashcard[]> {
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

export async function generateTargetedFlashcards(weaknesses: string[], documentContent?: string, count: number = 10): Promise<Flashcard[]> {
  // Try Gemini first, then fallback to OpenAI
  return tryWithFallback(
    () => generateTargetedFlashcardsGemini(weaknesses, documentContent, count),
    () => generateTargetedFlashcardsOpenAI(weaknesses, documentContent, count),
    "נכשל ביצירת כרטיסיות ממוקדות."
  );
}

// Targeted quiz generation with OpenAI
async function generateTargetedQuizOpenAI(weaknesses: string[], documentContent?: string, count: number = 10): Promise<QuizQuestion[]> {
  const openai = await getOpenAI();
  const weaknessesText = weaknesses.join(', ');
  
  // Use documentContent if available, otherwise use a default message
  const documentContentText = documentContent && documentContent.trim() 
    ? documentContent 
    : 'חומר הלימוד למבחן הרישוי למתווכי מקרקעין בישראל כולל חוקים, תקנות ועקרונות משפטיים רלוונטיים.';
  
  const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. המשתמש מתקשה בנושאים הבאים: ${weaknessesText}

צור ${count} שאלות ממוקדות שמתמקדות בנושאים אלה. כל שאלה צריכה להיות בפורמט מבחן אמריקאי עם 4 אפשרויות, האינדקס של התשובה הנכונה, והסבר קצר (משפט אחד). ההסבר חייב להיות פשוט וישיר. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו (ללא **). כל התוכן בעברית.

חומר הלימוד:
---
${documentContentText}
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

  const response = await openai.responses.create({
    model: openAIModel,
    instructions: 'אתה עוזר מומחה ביצירת שאלות ממוקדות למבחן. אתה תמיד מחזיר JSON בפורמט הבא: {"questions": [{"question": "...", "options": ["...", "..."], "correctAnswerIndex": 0, "explanation": "..."}]} ללא טקסט נוסף.',
    input: prompt,
    text: {
      format: {
        type: 'json_object'
      }
    },
    temperature: 0.9, // Higher temperature for more variety in flashcards
  });

  const content = response.output_text;
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
async function generateTargetedQuizGemini(weaknesses: string[], documentContent?: string, count: number = 10): Promise<QuizQuestion[]> {
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

export async function generateTargetedQuiz(weaknesses: string[], documentContent?: string, count: number = 10): Promise<QuizQuestion[]> {
  // Try OpenAI first, then fallback to Gemini
  try {
    const questions = await tryWithFallback(
      () => {
        return generateTargetedQuizOpenAI(weaknesses, documentContent, count);
      },
      () => {
        return generateTargetedQuizGemini(weaknesses, documentContent, count);
      },
      "נכשל ביצירת בוחן ממוקד."
    );
    
    return questions;
  } catch (error) {
    console.error('generateTargetedQuiz: Both OpenAI and Gemini failed:', error);
    throw error;
  }
}

// Generate questions with topic distribution (70% weak topics, 30% strong topics)
export async function generateQuizWithTopicDistribution(
  weakTopics: string[],
  strongTopics: string[],
  documentContent?: string,
  count: number = 10
): Promise<QuizQuestion[]> {
  const weakCount = Math.round(count * 0.7);
  const strongCount = count - weakCount;
  
  const questions: QuizQuestion[] = [];
  
  // Generate 70% from weak topics
  if (weakTopics.length > 0 && weakCount > 0) {
    try {
      const weakQuestions = await generateTargetedQuiz(weakTopics, documentContent || undefined, weakCount);
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
      const strongQuestions = await generateTargetedQuiz(strongTopics, documentContent || undefined, strongCount);
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


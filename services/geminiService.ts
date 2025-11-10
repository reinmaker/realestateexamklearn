import { GoogleGenAI, Type, GenerateContentResponse, Chat, Modality } from "@google/genai";
import { QuizQuestion, Flashcard, ChatMessage, QuizResult, AnalysisResult } from '../types';

// The GoogleGenAI instance is now created on-demand within each function.
// This prevents initialization errors when the module is first loaded,
// ensuring that import.meta.env.VITE_GEMINI_API_KEY is available at the time of the API call.
const getAi = () => new GoogleGenAI({ apiKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || '' });
const model = 'gemini-2.5-flash';

const quizSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctAnswerIndex: { type: Type.INTEGER },
      explanation: { type: Type.STRING },
      bookReference: { 
        type: Type.STRING, 
        description: "חובה מוחלטת: כל שאלה חייבת לכלול הפניה מדויקת שנמצאה ישירות מהקובץ. זהו שדה חובה - אל תחזיר שאלות ללא bookReference! הפניה מדויקת שנמצאה ישירות מהקובץ, לא הפניה מומצאת. פורמט: '[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ.' או '[שם החוק/התקנה המלא עם שנה] מתחילות בעמ' Y בקובץ.' דוגמאות: 'חוק המתווכים במקרקעין, התשנ\"ו–1996 – סעיף 9 מופיע בעמ' 2 בקובץ.' או 'תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ\"ז–1997 מתחילות בעמ' 15 בקובץ.'"
      },
    },
    required: ["question", "options", "correctAnswerIndex", "explanation", "bookReference"],
  },
};

const flashcardSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            question: { type: Type.STRING },
            answer: { type: Type.STRING },
            bookReference: { 
              type: Type.STRING, 
              description: "חובה: הפניה מדויקת שנמצאה ישירות מהקובץ, לא הפניה מומצאת. פורמט: '[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ.' או '[שם החוק/התקנה המלא עם שנה] מתחילות בעמ' Y בקובץ.' דוגמאות: 'חוק המתווכים במקרקעין, התשנ\"ו–1996 – סעיף 9 מופיע בעמ' 3 בקובץ.' או 'תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ\"ז–1997 מתחילות בעמ' 15 בקובץ.'"
            },
        },
        required: ["question", "answer", "bookReference"],
    },
};

const analysisSchema = {
    type: Type.OBJECT,
    properties: {
        strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "רשימה של עד 3 נושאים מרכזיים שבהם המשתמש מפגין הבנה טובה. אם אין תשובות נכונות, הרשימה צריכה להיות ריקה."
        },
        weaknesses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "רשימה של עד 3 נושאים מרכזיים שבהם המשתמש מתקשה. אם כל התשובות נכונות, הרשימה צריכה להיות ריקה."
        },
        recommendations: {
            type: Type.STRING,
            description: "המלצה תמציתית לשיפור הלמידה, מבוססת על החולשות. אם אין חולשות, ספק המלצה כללית."
        }
    },
    required: ["strengths", "weaknesses", "recommendations"]
};


/**
 * Generate quiz using retrieval-first approach
 * Retrieves relevant blocks from database, then generates questions from retrieved blocks only
 */
async function generateQuizWithRetrieval(count: number = 10): Promise<QuizQuestion[]> {
  try {
    // Import Supabase client
    const { supabase } = await import('./authService');
    
    const questions: QuizQuestion[] = [];
    
    // Generate questions one at a time to ensure each has proper citation
    // Add delay between calls to reduce load
    for (let i = 0; i < count; i++) {
      try {
        // Add delay between calls to reduce load on retrieve-blocks
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between calls
        }

        // Step 1: Retrieve relevant blocks
        // Use the cached helper function which includes retry logic, caching, and circuit breaker
        let retrieveData: any = null;
        let retrieveError: any = null;
        
        try {
          const { invokeRetrieveBlocks } = await import('./bookReferenceService');
          retrieveData = await invokeRetrieveBlocks(
            'חוקים ותקנות בנושא מתווכים במקרקעין',
            'part1',
            3
          );
        } catch (err: any) {
          retrieveError = err;
          // Check if circuit breaker is open
          if (err?.message?.includes('Circuit breaker')) {
            console.warn(`Circuit breaker is open, skipping question ${i + 1}`);
            continue;
          }
        }

        if (retrieveError || !retrieveData || !retrieveData.blocks || retrieveData.blocks.length === 0) {
          console.warn(`Failed to retrieve blocks for question ${i + 1}, skipping...`, retrieveError);
          continue;
        }

        const blocks = retrieveData.blocks;
        
        // Step 2: Generate question from retrieved blocks using Gemini
        const blockTexts = blocks.map((b: any) => `[page ${b.page_number} | block ${b.block_id}]\n${b.text}`).join('\n\n');
        
        const ai = getAi();
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

        // Wrap API call in retry logic for 503 errors
        const response = await retryWithBackoff(async () => {
          return await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: quizSchema,
            },
          });
        });

        const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
        const questionData = JSON.parse(cleanedText);
        
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
  } catch (error) {
    console.warn('Retrieval-based generation failed, falling back to AI:', error);
    // Fallback to existing AI-based approach
    const ai = getAi();
    try {
      return await retryWithBackoff(async () => {
    const { TABLE_OF_CONTENTS, attachBookPdfsToGemini } = await import('./bookReferenceService');
    
    // STEP 1: Upload PDFs FIRST, before generating questions
    let pdfAttachment: any = null;
    let contents: any = null;
    
    try {
      pdfAttachment = await attachBookPdfsToGemini(ai);
      
      if (pdfAttachment && pdfAttachment.parts.length > 0) {
        // Use PDFs with text prompt
        const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. 

חשוב מאוד - חובה מוחלטת: כל השאלות חייבות להיות מבוססות אך ורק על התוכן בקבצי ה-PDF המצורפים (חלק 1 וחלק 2). אסור לך ליצור שאלות על בסיס ידע כללי או מידע שלא מופיע בקבצי ה-PDF. כל שאלה חייבת להיות מבוססת על תוכן ספציפי שקראת בקבצי ה-PDF. אם נושא לא מופיע בקבצי ה-PDF, אל תיצור שאלה עליו.

תפקידך: ליצור סט חדש של בדיוק ${count} שאלות ייחודיות בפורמט מבחן אמריקאי על בסיס תוכן הספרים המצורפים (חלק 1 וחלק 2). השאלות צריכות לבחון את העקרונות המשפטיים המרכזיים המופיעים בספרים. לכל שאלה, ספק ארבע אפשרויות תשובה, את האינדקס של התשובה הנכונה, והסבר קצר במיוחד, בן משפט אחד בלבד. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חשוב ביותר: חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (כלומר, ללא כוכביות **). כל התוכן חייב להיות בעברית.

חשוב מאוד - חובה: כל שאלה חייבת לכלול שדה bookReference עם הפניה מדויקת. זהו שדה חובה בפורמט ה-JSON. אל תחזיר שאלות ללא bookReference!

תהליך יצירת כל שאלה - חשוב מאוד:
1. קרא את התוכן בקבצי ה-PDF המצורפים. חפש נושאים ספציפיים שמופיעים בקבצים.
2. לפני יצירת כל שאלה, חפש נושאים בחלקים שונים של הספר - לא רק בחלקים הראשונים! חפש נושאים גם בחלקים האמצעיים והסופיים של הספר.
3. לפני יצירת כל שאלה, חפש בקבצי ה-PDF המצורפים את ההפניה המדויקת (שם החוק/התקנה, מספר הסעיף, ומספר העמוד).
4. קרא את הטקסט הרלוונטי בקבצי ה-PDF, זהה את הסעיף המדויק ואת מספר העמוד.
5. וודא שההפניה לספר תואמת בדיוק לנושא השאלה שאתה עומד ליצור. חפש את הנושא הספציפי של השאלה בקבצי ה-PDF, וזהה את ההפניה המדויקת לנושא הזה בלבד.
6. רק לאחר שקראת את התוכן הספציפי בקבצי ה-PDF ומצאת את ההפניה המדויקת מהקובץ ווידאת שהיא תואמת לנושא השאלה, צור את השאלה המבוססת אך ורק על התוכן שקראת בקבצי ה-PDF.
7. חובה: כל שאלה חייבת להיות מבוססת על תוכן ספציפי שקראת בקבצי ה-PDF. אל תיצור שאלות על נושאים שלא מופיעים בקבצים.
8. חובה: כל שאלה חייבת לכלול את שדה bookReference עם ההפניה המדויקת שנמצאה. אל תחזיר שאלות ללא bookReference!
9. חובה: ודא שהשאלות מכסות נושאים מכל חלקי הספר - מההתחלה, מהאמצע, ומהסוף. אל תיצור כל השאלות מהחלקים הראשונים!

חשוב מאוד: כל שאלה חייבת להיות מבוססת אך ורק על תוכן שקראת בקבצי ה-PDF. אל תיצור שאלות על בסיס ידע כללי. כל שאלה חייבת לכלול הפניה מדויקת שנמצאה ישירות מהקובץ. אל תמציא הפניות. ההפניה חייבת להיות מדויקת ומבוססת על התוכן בפועל בקבצי ה-PDF. חובה לכלול את bookReference בכל שאלה!

חשוב מאוד: אם נושא לא מופיע בקבצי ה-PDF, אל תיצור שאלה עליו. כל השאלות חייבות להיות מבוססות על תוכן ספציפי שקראת בקבצי ה-PDF.

חשוב מאוד - חובה מוחלטת: קרא את כל התוכן בקבצי ה-PDF, לא רק חלקים מסוימים. ודא שאתה מבין את כל הנושאים המשפטיים בספר לפני יצירת שאלות. עבור על כל הפרקים והנושאים בספר, וודא שהשאלות מכסות נושאים מגוונים. קרא את כל התוכן בקבצי ה-PDF המצורפים, לא רק חלקים מסוימים.

חשוב מאוד - חובה מוחלטת: אל תיצור כל השאלות מהחלקים הראשונים של הספר! ודא שהשאלות מכסות את כל חלקי הספר - מההתחלה, מהאמצע, ומהסוף. חפש נושאים בחלקים שונים של הספר:
- חלק 1: עמודים 1-50 (מתווכים, חוקים בסיסיים)
- חלק 1: עמודים 51-100 (הגנת הצרכן, חוזים, מכר דירות)
- חלק 1: עמודים 101-150 (הגנת הדייר, תכנון ובנייה)
- חלק 1: עמודים 151+ (מיסוי מקרקעין, נושאים מתקדמים)
- חלק 2: כל הנושאים הנוספים

חשוב מאוד: לפני יצירת כל שאלה, חפש נושאים בחלקים שונים של הספר. אל תתמקד רק בחלקים הראשונים. ודא שהשאלות מכסות נושאים מכל חלקי הספר - מההתחלה, מהאמצע, ומהסוף.

חשוב מאוד - חובה מוחלטת: צור שאלות על נושאים מגוונים מהספר. אל תיצור כל השאלות על אותו נושא. כל שאלה חייבת להיות על נושא שונה מהשאלות הקודמות. ודא שהשאלות מכסות נושאים שונים כמו: מתווכים, הגנת הצרכן, חוזים, מקרקעין, מכר דירות, הגנת הדייר, תכנון ובנייה, מיסוי מקרקעין, ועוד. פרס את השאלות על פני נושאים שונים כדי לספק כיסוי מקיף של החומר.

חשוב מאוד - חובה: לפני יצירת כל שאלה, בדוק את הנושאים של השאלות שכבר יצרת. וודא שהשאלה החדשה היא על נושא שונה לחלוטין מהשאלות הקודמות. אם כבר יצרת שאלה על "מתווכים", אל תיצור עוד שאלה על "מתווכים" - בחר נושא אחר כמו "הגנת הצרכן" או "מכר דירות". כל שאלה חייבת להיות על נושא ייחודי שלא הופיע בשאלות הקודמות.

חשוב מאוד - חובה: ודא שהשאלות מכסות נושאים מכל חלקי הספר. אל תיצור כל השאלות מהחלקים הראשונים. צור שאלות גם מהחלקים האמצעיים והסופיים של הספר. חפש נושאים בחלקים שונים של הספר לפני יצירת כל שאלה.

אל תקצר תהליכים - לכל שאלה בנפרד, חפש את ההפניה, וודא שהיא תואמת לנושא השאלה, ורק אז צור את השאלה. ההפניה חייבת להיות רלוונטית ישירות לנושא השאלה. אם השאלה על 'גילוי מידע מהותי', ההפניה חייבת להיות לסעיף שמדבר על 'גילוי מידע מהותי'.

הוראות להפניה לספר:
- כל ההפניות חייבות להיות לחלק 1 של הספר
- לכל שאלה, ספק הפניה לספר בפורמט: "[שם החוק/התקנה המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ." או "[שם החוק/התקנה המלא עם שנה] מתחילות בעמ' Y בקובץ."
- חשוב מאוד: אל תפנה ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17. תקנות אלו אינן רלוונטיות ליצירת שאלות. השתמש רק בחוקים ותקנות אחרים.
- אל תכלול הפניות ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17.
- חשוב מאוד: חוק המתווכים במקרקעין, התשנ"ו–1996 מופיע בעמודים 1-2, לא בעמוד 15. אל תפנה לחוק זה בעמוד 15. עמוד 15 מכיל תקנות, לא את החוק עצמו.
- דוגמאות:
  * "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9 מופיע בעמ' 2 בקובץ."
  * "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997 מתחילות בעמ' 15 בקובץ."`;

        contents = [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...pdfAttachment.parts
            ],
          },
        ];
      } else {
        console.warn('Gemini generateQuiz: PDFs uploaded but no parts available');
      }
    } catch (error) {
      console.warn('Gemini generateQuiz: Failed to attach PDFs to Gemini, using text-only prompt:', error);
    }
    
    // STEP 2: Fallback to text-only prompt if PDFs not attached
    if (!contents) {
      const { TABLE_OF_CONTENTS } = await import('./bookReferenceService');
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
7. חשוב מאוד: חוק המתווכים במקרקעין, התשנ"ו–1996 מופיע בעמודים 1-2, לא בעמוד 15. אל תפנה לחוק זה בעמוד 15. עמוד 15 מכיל תקנות, לא את החוק עצמו.`;

      contents = prompt;
    }

    // STEP 3: Generate questions with PDFs already uploaded
    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: quizSchema,
      },
    });
    
    // Cleanup PDFs if attached
    if (pdfAttachment) {
      try {
        await pdfAttachment.cleanup();
      } catch (cleanupError) {
        console.warn('Failed to cleanup PDFs:', cleanupError);
      }
    }
    
    // Verify response structure
    if (!response || !response.text) {
      console.error('Gemini generateQuiz: Invalid response structure:', response);
      throw new Error("Invalid response from Gemini API");
    }
    
    // Clean up potential markdown formatting before parsing
    let cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
    
    // Verify cleaned text is valid JSON
    let questions: QuizQuestion[];
    try {
      questions = JSON.parse(cleanedText) as QuizQuestion[];
    } catch (parseError) {
      console.error('Gemini generateQuiz: JSON parse error:', parseError);
      console.error('Gemini generateQuiz: Failed to parse text:', cleanedText.substring(0, 1000));
      throw new Error("Failed to parse Gemini response as JSON");
    }
      
      if (!Array.isArray(questions)) {
          throw new Error("AI response is not a JSON array.");
      }
      
      // STEP 4: Validate that all questions have bookReference (should be there from initial generation)
      const missingReferences: number[] = [];
      questions.forEach((q, index) => {
        if (!q.bookReference || q.bookReference.trim() === '') {
          missingReferences.push(index + 1);
          console.error(`Gemini generateQuiz: ERROR - Question ${index + 1} is missing bookReference!`, {
            question: q.question.substring(0, 50),
            hasBookReference: !!q.bookReference,
            bookReferenceValue: q.bookReference
          });
        }
      });
      
      if (missingReferences.length > 0) {
        console.error(`Gemini generateQuiz: ERROR - ${missingReferences.length} questions are missing bookReference:`, missingReferences);
        console.error('Gemini generateQuiz: This should not happen - bookReference is REQUIRED in the schema!');
      }
      
      // STEP 5: Process questions - bookReference should already be there from generation
      const { getBookReferenceByAI } = await import('./bookReferenceService');
      
      const processedQuestions = await Promise.all(questions.map(async (q, index) => {
          const correctAnswerText = q.options[q.correctAnswerIndex];
          const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
          const newCorrectAnswerIndex = shuffledOptions.indexOf(correctAnswerText);
          
          // bookReference should already be present from generation (it's required in schema)
          let bookReference = q.bookReference;
          
          // Only use fallback if bookReference is completely missing (should not happen)
          if (!bookReference || bookReference.trim() === '') {
            console.error(`Gemini generateQuiz: ERROR - Question ${index + 1} missing bookReference despite being required! Using fallback.`);
            try {
              bookReference = await getBookReferenceByAI(q.question, undefined, documentContent);
            } catch (error) {
              console.error(`Gemini generateQuiz: Question ${index + 1} - Failed to get book reference for question:`, error);
              bookReference = 'חלק 1';
            }
          } else {
            // Validate that the reference matches the question topic
            const { validateReferenceMatchesQuestion } = await import('./bookReferenceService');
            const validation = validateReferenceMatchesQuestion(q.question, bookReference);
            if (!validation.isValid) {
              console.warn(`Gemini generateQuiz: Question ${index + 1} - Book reference does not match question topic:`, {
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
                  console.warn(`Gemini generateQuiz: Question ${index + 1} - Failed to get correct book reference for question:`, error);
                  // Keep original reference but log warning
                }
              }
            }
          }
          
          const processedQuestion = {
              ...q,
              options: shuffledOptions,
              correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0, // Fallback to 0 if not found
              bookReference
          };
          
          return processedQuestion;
      }));
      
      // STEP 6: Final validation - all questions should have bookReference
      processedQuestions.forEach((q, index) => {
        if (!q.bookReference || q.bookReference.trim() === '') {
          console.error(`Gemini generateQuiz: ERROR - Final question ${index + 1} still missing bookReference!`);
        }
      });
      
      // STEP 7: Ensure topic diversity - filter out questions with duplicate topics
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
          console.warn('Gemini generateQuiz: Failed to categorize question by topic:', error);
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
      
      // First pass: add one question from each topic
      for (const [topic, topicQuestions] of topicMap.entries()) {
        if (topicQuestions.length > 0 && diverseQuestions.length < count) {
          const question = topicQuestions[0];
          diverseQuestions.push(question);
        }
      }
      
      // Second pass: add more questions from different topics (up to maxPerTopic per topic)
      for (const [topic, topicQuestions] of topicMap.entries()) {
        if (diverseQuestions.length >= count) break;
        const currentCount = diverseQuestions.filter(q => topicQuestions.includes(q)).length;
        
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
      const finalQuestions = diverseQuestions.sort(() => Math.random() - 0.5).slice(0, count);
      
      return finalQuestions;
    });

  } catch (error) {
    console.error(`Error generating quiz:`, error);
    if (error instanceof SyntaxError) {
        console.error("The response was not valid JSON.");
    }
    // Check if it's a retryable error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('overloaded') || errorMessage.includes('503')) {
      throw new Error("השירות עמוס כרגע. אנא נסה שוב בעוד כמה רגעים.");
    }
    throw new Error("נכשל ביצירת שאלות הבוחן.");
  }
}


/**
 * Determines the correct answer index and explanation for a question with options
 * This is much faster than generating the entire question
 */
/**
 * Retry helper with exponential backoff
 */
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
      
      // Check if it's a 503 (overloaded) or 429 (rate limit) error
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
        errorString.includes('Service Unavailable');
      
      if (!isRetryableError || attempt === maxRetries - 1) {
        console.error(`Non-retryable error or max retries reached. Throwing error.`, {
          isRetryableError,
          attempt,
          maxRetries,
          statusCode,
          errorMessage,
        });
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export async function determineAnswerAndExplanation(
  question: string,
  options: string[],
  documentContent: string
): Promise<{ correctAnswerIndex: number; explanation: string }> {
  const ai = getAi();
  try {
    return await retryWithBackoff(async () => {
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

    const answerSchema = {
      type: Type.OBJECT,
      properties: {
        correctAnswerIndex: { type: Type.INTEGER, description: "האינדקס של התשובה הנכונה (0-3)" },
        explanation: { type: Type.STRING, description: "הסבר קצר מדוע זו התשובה הנכונה" }
      },
      required: ["correctAnswerIndex", "explanation"]
    };

    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: answerSchema,
      },
    });

    const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
    const result = JSON.parse(cleanedText);
    
    // Validate answer index is within bounds
    if (result.correctAnswerIndex < 0 || result.correctAnswerIndex >= options.length) {
      throw new Error(`Invalid answer index: ${result.correctAnswerIndex}`);
    }

      return {
        correctAnswerIndex: result.correctAnswerIndex,
        explanation: result.explanation
      };
    });

  } catch (error) {
    console.error(`Error determining answer:`, error);
    if (error instanceof SyntaxError) {
      console.error("The response was not valid JSON.");
    }
    // Check if it's a retryable error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('overloaded') || errorMessage.includes('503')) {
      throw new Error("השירות עמוס כרגע. אנא נסה שוב בעוד כמה רגעים.");
    }
    throw new Error("נכשל בקביעת התשובה הנכונה.");
  }
}

export async function generateFlashcards(documentContent?: string, count: number = 10): Promise<Flashcard[]> {
    const ai = getAi();
    try {
        const { TABLE_OF_CONTENTS } = await import('./bookReferenceService');
        const prompt = `אתה מורה מומחה למבחן התיווך הישראלי. תפקידך הוא לזהות את עקרונות הליבה המשפטיים, ההגדרות והכללים המרכזיים הנבחנים במסמך המצורף. בהתבסס על כך, צור סט של ${count} כרטיסיות לימוד בפורמט של שאלה-תשובה. כל כרטיסייה צריכה להתמקד במושג אחד חשוב. השאלות צריכות להיות ברורות. התשובות חייבות להיות קצרות ותמציתיות באופן קיצוני - משפט קצר אחד או שניים לכל היותר. יש לנסח אותן בשפה פשוטה וישירה. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (ללא כוכביות **). אל תהפוך את שאלות המבחן הקיימות לכרטיסיות; במקום זאת, זקק מהן את הידע המשפטי הבסיסי. כל התוכן חייב להיות בעברית.

המסמך המכיל מבחנים קודמים הוא:
---
${documentContent}
---

תוכן העניינים של הספר "חלק 1":
---
${TABLE_OF_CONTENTS}
---

הוראות להפניה לספר:
1. ניתוח את נושא השאלה וזהה את הנושא המרכזי
2. התאם את הנושא לפרק המתאים מתוך תוכן העניינים הכללי
3. השתמש במפתח הנושאים המפורט כדי למצוא את מספר העמוד הספציפי לנושא
4. לכל כרטיסייה, ספק הפניה לספר בפורמט: "חלק 1 - פרק X: [שם הפרק], עמוד Y"
`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: flashcardSchema,
            },
        });

        const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
        const flashcards = JSON.parse(cleanedText) as Flashcard[];
        
        // Ensure bookReference for each flashcard
        const { getBookReferenceByAI } = await import('./bookReferenceService');
        const processedFlashcards = await Promise.all(flashcards.map(async (card) => {
          let bookReference = card.bookReference;
          if (!bookReference || !bookReference.startsWith('חלק 1 - פרק')) {
            try {
              bookReference = await getBookReferenceByAI(card.question, undefined, documentContent);
            } catch (error) {
              console.warn('Failed to get book reference for flashcard:', error);
              bookReference = 'חלק 1';
            }
          }
          return {
            ...card,
            bookReference
          };
        }));
        
        return processedFlashcards;

    } catch (error) {
        console.error("Error generating flashcards:", error);
        if (error instanceof SyntaxError) {
            console.error("The response was not valid JSON.");
        }
        throw new Error("נכשל ביצירת כרטיסיות. אנא נסה שוב.");
    }
}

export function createChatSession(documentContent: string): Chat {
    const ai = getAi();
    const systemInstruction = `אתה דניאל, מורה פרטי ידידותי וסבלני למבחן התיווך הישראלי. הידע שלך מבוסס באופן בלעדי על המסמך שסופק. דבר עם המשתמש בגובה העיניים ובאופן ישיר. תשובותיך חייבות להיות קצרות מאוד ותמציתיות. הימנע מהסברים ארוכים. חשוב ביותר: אל תשתמש בשום פנים ואופן בעיצוב טקסט כמו הדגשה (ללא **). ענה על שאלותיו, הבהר מושגים ועזור לו להבין את החומר הנלמד מהבחינות. אם התשובה לא נמצאת במסמך, ציין זאת בבירור. השב תמיד בעברית. המסמך לעיונך:

---
${documentContent}
---
`;

    const chat: Chat = ai.chats.create({
        model,
        config: {
            systemInstruction,
        },
    });
    return chat;
}

export function createExplanationChatSession(documentContent: string, context: string): Chat {
    const ai = getAi();
    const systemInstruction = `אתה דניאל, מורה פרטי מומחה למבחן התיווך הישראלי. הידע שלך מבוסס באופן בלעדי על חומר הלימוד שסופק. המשתמש ביקש הסבר נוסף על הנושא הבא:
---
${context}
---
הסבר את הנושא בצורה ברורה ותמציתית ביותר. השתמש בשפה פשוטה ודוגמאות קצרות. הימנע מפרטים מיותרים. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד הדגשה (ללא **). התשובה צריכה להיות קצרה וישירה. השב תמיד בעברית.

חומר לימוד:
---
${documentContent}
---
`;

    const chat: Chat = ai.chats.create({
        model,
        config: {
            systemInstruction,
        },
    });
    return chat;
}

export async function analyzeProgress(results: QuizResult[], documentContent: string): Promise<AnalysisResult> {
    const ai = getAi();
    const correctQuestions = results.filter(r => r.isCorrect).map(r => r.question).join('\n');
    const incorrectQuestions = results.filter(r => !r.isCorrect).map(r => `שאלה: ${r.question}\nהסבר: ${r.explanation}`).join('\n\n');

    const prompt = `אתה דניאל, מורה מומחה למבחן התיווך הישראלי, ואתה מספק משוב אישי לתלמיד. נתח את ביצועיו בהתבסס על השאלות שענה נכון ושגוי.
ספק את הניתוח שלך בטון מעודד וממוקד.

בהתבסס על השאלות שנענו נכון, זהה עד 3 נושאים משפטיים כלליים שבהם הוא מפגין חוזק. אם לא היו תשובות נכונות, השאר את רשימת החוזקות ריקה.
בהתבסס על השאלות שנענו לא נכון, זהה 2-3 נושאים עיקריים שבהם הוא נראה חלש. אם כל התשובות היו נכונות, השאר את רשימת החולשות ריקה.
ספק המלצות קצרות מאוד ומעשיות לשיפור (משפט אחד לכל המלצה), מבוססות על החולשות שזוהו. אם אין חולשות, ספק המלצה כללית להמשך תרגול.

כל הניתוח חייב להיות מנוסח בפשטות ובאופן ישיר. חל איסור מוחלט על שימוש בעיצוב טקסט כלשהו, במיוחד הדגשה (ללא **). הניתוח שלך צריך להתבסס על הנושאים המכוסים בחומר הלימוד שסופק. כל התוכן חייב להיות בעברית.

שאלות שנענו נכון:
---
${correctQuestions || "אין"}
---

שאלות שנענו לא נכון (כולל הסברים לתשובה הנכונה):
---
${incorrectQuestions || "אין"}
---

חומר לימוד (מבחנים קודמים):
---
${documentContent}
---
`;
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: analysisSchema,
            },
        });
        
        const jsonText = response.text.trim();
        const analysisData = JSON.parse(jsonText);
        return analysisData as AnalysisResult;

    } catch (error) {
        console.error("Error analyzing progress:", error);
        throw new Error("נכשל בניתוח ההתקדמות. אנא נסה שוב מאוחר יותר.");
    }
}


export async function continueChat(chat: Chat, message: string, history: ChatMessage[]): Promise<string> {
    try {
        const response: GenerateContentResponse = await chat.sendMessage({ message });
        return response.text;
    } catch (error) {
        console.error("Error in chat session:", error);
        throw new Error("אירעה בעיה בתקשורת עם הבינה המלאכותית. אנא נסה שוב.");
    }
}

export async function generateHint(question: string, answer: string, documentContent: string): Promise<string> {
    const ai = getAi();
    try {
        const prompt = `אתה דניאל, מורה פרטי מומחה למבחן התיווך הישראלי. תפקידך הוא לתת רמז שיעזור לתלמיד להגיע לתשובה הנכונה בעצמו, מבלי לחשוף אותה.

התלמיד מסתכל על כרטיסיית הלימוד הבאה:
שאלה: "${question}"
תשובה נכונה: "${answer}"

חומר הלימוד הרלוונטי הוא:
---
${documentContent}
---

משימתך:
1. זהה את עקרון הליבה או החוק הספציפי שהשאלה בוחנת, על סמך חומר הלימוד.
2. כתוב רמז מנחה, ברור וקצר (משפט אחד).
3. הרמז צריך להתמקד ב'איך' לחשוב על הבעיה או 'מה' לחפש בתשובה, ולא ב'מה' התשובה. לדוגמה, במקום "התשובה קשורה לרישיון", אמור "חשוב על התנאים הבסיסיים ביותר שנדרשים כדי לעסוק במקצוע".
4. הרמז חייב להיות בעברית, וללא כל עיצוב טקסט (ללא הדגשה).

רמז:`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model,
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error generating hint:", error);
        throw new Error("נכשל ביצירת רמז. אנא נסה שוב.");
    }
}

export async function generateSpeech(textToSpeak: string): Promise<string> {
    const ai = getAi();
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ parts: [{ text: `השמע את הטקסט הבא בעברית: ${textToSpeak}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data received from API.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw new Error("נכשל ביצירת שמע. אנא נסה שוב.");
    }
}

export async function generateTargetedFlashcards(weaknesses: string[], documentContent: string, count: number): Promise<Flashcard[]> {
    const ai = getAi();
    try {
        const prompt = `אתה מורה מומחה למבחן התיווך הישראלי. תפקידך ליצור סט של ${count} כרטיסיות לימוד ממוקדות כדי לעזור לתלמיד לחזק את נקודות התורפה שלו. הכרטיסיות צריכות להתמקד אך ורק בנושאים הבאים: ${weaknesses.join(', ')}.

השתמש בחומר הלימוד המצורף כמקור בלעדי לידע. כל כרטיסייה צריכה להיות בפורמט שאלה-תשובה. שאלות ברורות, תשובות קצרות ותמציתיות (משפט אחד או שניים). אין להשתמש בעיצוב טקסט כלשהו (כמו הדגשה). כל התוכן חייב להיות בעברית.

חומר לימוד:
---
${documentContent}
---
`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: flashcardSchema,
            },
        });

        const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
        return JSON.parse(cleanedText) as Flashcard[];

    } catch (error) {
        console.error("Error generating targeted flashcards:", error);
        throw new Error("נכשל ביצירת כרטיסיות ממוקדות. אנא נסה שוב.");
    }
}


export async function generateTargetedQuiz(weaknesses: string[], documentContent: string, count: number): Promise<QuizQuestion[]> {
  const ai = getAi();
  try {
    const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא ליצור בוחן ממוקד של ${count} שאלות ייחודיות בפורמט מבחן אמריקאי. הבוחן צריך להתמקד ספציפית בנושאים הבאים, שזוהו כנקודות חולשה של התלמיד: ${weaknesses.join(', ')}.

השאלות צריכות להיות דומות בסגנון ובדרגת קושי למבחנים קודמים המופיעים במסמך המצורף. לכל שאלה, ספק ארבע אפשריות תשובה, את האינדקס של התשובה הנכונה, והסבר קצר בן משפט אחד. אין להשתמש בעיצוב טקסט כלשהו (ללא הדגשה). כל התוכן חייב להיות בעברית.

המסמך המכיל מבחנים קודמים הוא:
---
${documentContent}
---
`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: quizSchema,
      },
    });
    
    const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
    const questions = JSON.parse(cleanedText) as QuizQuestion[];
    if (!Array.isArray(questions)) {
        throw new Error("AI response is not a JSON array for targeted quiz.");
    }
    return questions;

  } catch (error) {
    console.error(`Error generating targeted quiz:`, error);
    throw new Error("נכשל ביצירת בוחן ממוקד.");
  }
}
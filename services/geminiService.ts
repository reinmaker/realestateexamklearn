import { GoogleGenAI, Type, GenerateContentResponse, Chat, Modality } from "@google/genai";
import { QuizQuestion, Flashcard, ChatMessage, QuizResult, AnalysisResult } from '../types';

// The GoogleGenAI instance is now created on-demand within each function.
// This prevents initialization errors when the module is first loaded,
// ensuring that process.env.API_KEY is available at the time of the API call.
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    },
    required: ["question", "options", "correctAnswerIndex", "explanation"],
  },
};

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


export async function generateQuiz(documentContent: string, count: number): Promise<QuizQuestion[]> {
  const ai = getAi();
  try {
    return await retryWithBackoff(async () => {
    const prompt = `אתה מומחה ביצירת שאלות למבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא ליצור סט חדש של בדיוק ${count} שאלות ייחודיות בפורמט מבחן אמריקאי. השאלות צריכות להיות דומות בסגנון ובדרגת קושי למבחנים קודמים שמופיעים במסמך המצורף. השאלות החדשות צריכות לבחון את אותם עקרונות משפטיים מרכזיים אך להציג אותם בתרחישים חדשים. לכל שאלה, ספק ארבע אפשריות תשובה, את האינדקס של התשובה הנכונה, והסבר קצר במיוחד, בן משפט אחד בלבד. ההסבר חייב להיות פשוט, ישיר ובגובה העיניים. חשוב ביותר: חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (כלומר, ללא כוכביות **). אל תעתיק או תנסח מחדש שאלות מהמסמך שסופק. כל התוכן חייב להיות בעברית.

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
    
    // Clean up potential markdown formatting before parsing
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
              correctAnswerIndex: newCorrectAnswerIndex !== -1 ? newCorrectAnswerIndex : 0 // Fallback to 0 if not found
          };
      });
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
      
      // Check if it's a 503 (overloaded) or 429 (rate limit) error
      const isRetryableError = 
        error?.status === 503 || 
        error?.status === 429 ||
        error?.message?.includes('overloaded') ||
        error?.message?.includes('rate limit');
      
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

export async function generateFlashcards(documentContent: string, count: number): Promise<Flashcard[]> {
    const ai = getAi();
    try {
        const prompt = `אתה מורה מומחה למבחן התיווך הישראלי. תפקידך הוא לזהות את עקרונות הליבה המשפטיים, ההגדרות והכללים המרכזיים הנבחנים במסמך המצורף. בהתבסס על כך, צור סט של ${count} כרטיסיות לימוד בפורמט של שאלה-תשובה. כל כרטיסייה צריכה להתמקד במושג אחד חשוב. השאלות צריכות להיות ברורות. התשובות חייבות להיות קצרות ותמציתיות באופן קיצוני - משפט קצר אחד או שניים לכל היותר. יש לנסח אותן בשפה פשוטה וישירה. חל איסור מוחלט להשתמש בעיצוב טקסט כלשהו, במיוחד לא בהדגשה (ללא כוכביות **). אל תהפוך את שאלות המבחן הקיימות לכרטיסיות; במקום זאת, זקק מהן את הידע המשפטי הבסיסי. כל התוכן חייב להיות בעברית.

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
                responseSchema: flashcardSchema,
            },
        });

        const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
        return JSON.parse(cleanedText) as Flashcard[];

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
            model: "gemini-2.5-flash-preview-tts",
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
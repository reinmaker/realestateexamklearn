import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { documentContent } from '../studyMaterial.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// ES module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
const envPath = resolve(__dirname, '../.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
} catch (error) {
  console.warn('Could not load .env.local file:', error);
}

const supabaseUrl = 'https://arhoasurtfurjgfohlgt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyaG9hc3VydGZ1cmpnZm9obGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDQ5MDIsImV4cCI6MjA3NzgyMDkwMn0.FwXMPAnBpOhZnAg90PUQttaSvpgvVbRb_xNctF-reWw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
};

const getGemini = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  return new GoogleGenAI({ apiKey });
};

const openAIModel = 'gpt-4o-mini';
const geminiModel = 'gemini-2.5-flash';

interface DbQuestion {
  id: string;
  question_number: number;
  question_text: string;
  options?: string[];
  answer?: string;
  explanation?: string;
}

async function determineAnswerAndExplanation(
  question: string,
  options: string[],
  documentContent: string
): Promise<{ correctAnswerIndex: number; explanation: string }> {
  // Try OpenAI first, fallback to Gemini
  try {
    const openai = getOpenAI();
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

השב ב-JSON עם מבנה:
{
  "correctAnswerIndex": 0,
  "explanation": "הסבר קצר"
}`;

    const response = await openai.chat.completions.create({
      model: openAIModel,
      messages: [
        { 
          role: 'system', 
          content: 'אתה מערכת לקביעת תשובות נכונות. אתה תמיד מחזיר JSON עם correctAnswerIndex (0-3) ו-explanation.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);
    
    // Validate answer index is within bounds
    if (result.correctAnswerIndex < 0 || result.correctAnswerIndex >= options.length) {
      throw new Error(`Invalid answer index: ${result.correctAnswerIndex}`);
    }

    return {
      correctAnswerIndex: result.correctAnswerIndex,
      explanation: result.explanation || 'לא צוין הסבר'
    };
  } catch (error) {
    console.warn('OpenAI failed, trying Gemini...', error);
    
    // Fallback to Gemini
    try {
      const ai = getGemini();
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
        model: geminiModel,
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
        explanation: result.explanation || 'לא צוין הסבר'
      };
    } catch (geminiError) {
      console.error(`Error determining answer with both OpenAI and Gemini:`, geminiError);
      throw new Error("נכשל בקביעת התשובה הנכונה.");
    }
  }
}

async function precomputeAnswers() {
  // Fetch all questions with options but WITHOUT answers (answer IS NULL)
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, question_number, question_text, options, answer, explanation')
    .not('options', 'is', null)
    .is('answer', null) // Only get questions where answer IS NULL
    .order('question_number', { ascending: true });

  if (error) {
    console.error('Error fetching questions:', error);
    return;
  }

  if (!questions || questions.length === 0) {
    return;
  }

  // Filter to only questions with 4 options and no answer
  const validQuestions = questions.filter(q => 
    q.options && 
    Array.isArray(q.options) && 
    q.options.length === 4 &&
    !q.answer // Only process if answer is missing (null or undefined)
  );

  if (validQuestions.length === 0) {
    return;
  }

  let processed = 0;
  let failed = 0;

  // Process questions one by one
  for (let i = 0; i < validQuestions.length; i++) {
    const question = validQuestions[i];
    
    try {
      const result = await determineAnswerAndExplanation(
        question.question_text,
        question.options,
        documentContent
      );

      // Store the correct answer TEXT (not index) so options can be randomized later
      const correctAnswerText = question.options[result.correctAnswerIndex];
      
      if (!correctAnswerText) {
        console.error(`Error: No answer text found at index ${result.correctAnswerIndex} for question ${question.question_number}`);
        failed++;
        continue;
      }

      // Update the database with answer text and explanation
      const { error: updateError } = await supabase
        .from('questions')
        .update({
          answer: correctAnswerText, // Store the actual answer text (not the index)
          explanation: result.explanation,
          updated_at: new Date().toISOString()
        })
        .eq('id', question.id);

      if (updateError) {
        console.error(`Error updating question ${question.question_number}:`, updateError);
        failed++;
      } else {
        processed++;
      }

      // Add a small delay to avoid rate limiting (increased delay for better reliability)
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`\nError processing question ${question.question_number}:`, error);
      failed++;
      
      // If it's a rate limit error, wait longer before continuing
      if (error instanceof Error && (error.message.includes('rate limit') || error.message.includes('429'))) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
}

// Run the script
precomputeAnswers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });


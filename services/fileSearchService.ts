import OpenAI from 'openai';
import { getOpenAIKey } from './apiKeysService';

// Cache for OpenAI client
let openAIClient: OpenAI | null = null;
let openAIKey: string | null = null;

// Initialize OpenAI client
const getOpenAI = async (): Promise<OpenAI> => {
  try {
    const apiKey = await getOpenAIKey();
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    
    if (!openAIClient || openAIKey !== apiKey) {
      openAIKey = apiKey;
      openAIClient = new OpenAI({ 
        apiKey,
        dangerouslyAllowBrowser: true 
      });
    }
    
    return openAIClient;
  } catch (error) {
    const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || null;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured in environment variables');
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

// File paths
const FILE_PATHS = {
  part1: '/Users/reinmkr/Documents/realestateMatirls/part1.pdf',
  part2: '/Users/reinmkr/Documents/realestateMatirls/part2.pdf'
};

/**
 * Upload files to OpenAI and create a vector store
 * Note: You need to manually upload the PDF files to OpenAI first
 */
export async function createVectorStoreWithFiles(): Promise<string> {
  const openai = await getOpenAI();
  
  console.log('📁 Creating vector store with existing files...');
  
  // For now, we'll create an empty vector store and you'll need to upload files manually
  // In a real implementation, you'd need a backend service to handle file uploads
  
  throw new Error(`
    Manual setup required:
    
    1. Go to https://platform.openai.com/playground/assistants
    2. Create a new assistant
    3. Upload your PDF files (part1.pdf and part2.pdf)
    4. Copy the vector store ID from the assistant
    5. Set it in your environment as VITE_VECTOR_STORE_ID
    
    Or use the existing vector store ID if you already have one.
  `);
}

// Section mapping for keyword-based lookup
const sectionMapping: Record<string, { chapter: string; section: string; law: string }> = {
  "גוש": { chapter: "פרק 4: מקרקעין", section: "סעיף 125", law: "חוק המקרקעין" },
  "חלקה": { chapter: "פרק 4: מקרקעין", section: "סעיף 125", law: "חוק המקרקעין" },
  "נסח": { chapter: "פרק 4: מקרקעין", section: "סעיף 125", law: "חוק המקרקעין" },
  "נסח טאבו": { chapter: "פרק 4: מקרקעין", section: "סעיף 125", law: "חוק המקרקעין" },
  "פנקסי מקרקעין": { chapter: "פרק 4: מקרקעין", section: "סעיף 125", law: "חוק המקרקעין" },
  "תום לב": { chapter: "פרק 4: מקרקעין", section: "סעיף 10", law: "חוק המקרקעין" },
  "קונה תם לב": { chapter: "פרק 4: מקרקעין", section: "סעיף 10", law: "חוק המקרקעין" },
  "נרשם בטאבו": { chapter: "פרק 4: מקרקעין", section: "סעיף 10", law: "חוק המקרקעין" },
  "הסתמכות על רישום": { chapter: "פרק 4: מקרקעין", section: "סעיף 10", law: "חוק המקרקעין" },
  "דמי מפתח": { chapter: "פרק 6: הגנת הדייר", section: "סעיפים 74-84", law: "חוק הגנת הדייר" },
  "דייר מוגן": { chapter: "פרק 6: הגנת הדייר", section: "סעיף 1", law: "חוק הגנת הדייר" },
  "דייר שנפטר": { chapter: "פרק 6: הגנת הדייר", section: "סעיף 20", law: "חוק הגנת הדייר" },
  "בן זוג דייר": { chapter: "פרק 6: הגנת הדייר", section: "סעיף 20", law: "חוק הגנת הדייר" },
  "היטל השבחה": { chapter: "פרק 7: תכנון ובנייה", section: "סעיף 2 לתוספת שלישית", law: "חוק התכנון והבנייה" },
  "הערת אזהרה": { chapter: "פרק 4: מקרקעין", section: "סעיף 126", law: "חוק המקרקעין" },
  "בית משותף": { chapter: "פרק 4: מקרקעין", section: "סעיף 52", law: "חוק המקרקעין" },
  "רכוש משותף": { chapter: "פרק 4: מקרקעין", section: "סעיף 52", law: "חוק המקרקעין" },
  "תקנון מצוי": { chapter: "פרק 4: מקרקעין", section: "סעיף 64", law: "חוק המקרקעין" },
  "תקנון בית משותף": { chapter: "פרק 4: מקרקעין", section: "סעיף 61", law: "חוק המקרקעין" },
  "הצמדה": { chapter: "פרק 4: מקרקעין", section: "סעיף 55", law: "חוק המקרקעין" },
  "ערבות בנקאית": { chapter: "פרק 5: מכר דירות", section: "סעיף 2", law: "חוק המכר (דירות)" },
  "בטוחה": { chapter: "פרק 5: מכר דירות", section: "סעיף 2", law: "חוק המכר (דירות)" },
  "מפרט": { chapter: "פרק 5: מכר דירות", section: "סעיף 3", law: "חוק המכר (דירות)" },
  "תקופת בדק": { chapter: "פרק 5: מכר דירות", section: "סעיף 4", law: "חוק המכר (דירות)" },
  "ליקויי בנייה": { chapter: "פרק 5: מכר דירות", section: "סעיף 4", law: "חוק המכר (דירות)" },
  "אחריות קבלן": { chapter: "פרק 5: מכר דירות", section: "סעיף 4", law: "חוק המכר (דירות)" },
  "עסקאות נוגדות": { chapter: "פרק 4: מקרקעין", section: "סעיף 9", law: "חוק המקרקעין" },
  "מכירה כפולה": { chapter: "פרק 4: מקרקעין", section: "סעיף 9", law: "חוק המקרקעין" },
  "משכנתא": { chapter: "פרק 4: מקרקעין", section: "סעיף 85", law: "חוק המקרקעין" },
  "שיעבוד": { chapter: "פרק 4: מקרקעין", section: "סעיף 85", law: "חוק המקרקעין" },
  "חכירה": { chapter: "פרק 4: מקרקעין", section: "סעיף 3", law: "חוק המקרקעין" },
  "חכירה לדורות": { chapter: "פרק 4: מקרקעין", section: "סעיף 3", law: "חוק המקרקעין" },
  "שכירות": { chapter: "פרק 4: מקרקעין", section: "סעיף 78", law: "חוק המקרקעין" },
  "דמי תיווך": { chapter: "פרק 1: מתווכים", section: "סעיף 9", law: "חוק המתווכים במקרקעין" },
  "הסכם תיווך": { chapter: "פרק 1: מתווכים", section: "סעיף 9", law: "חוק המתווכים במקרקעין" },
  "בלעדיות": { chapter: "פרק 1: מתווכים", section: "סעיף 9", law: "חוק המתווכים במקרקעין" },
  "רישיון תיווך": { chapter: "פרק 1: מתווכים", section: "סעיף 2", law: "חוק המתווכים במקרקעין" },
  "חובת גילוי": { chapter: "פרק 1: מתווכים", section: "סעיף 8", law: "חוק המתווכים במקרקעין" },
  "טעות": { chapter: "פרק 3: חוזים", section: "סעיף 14", law: "חוק החוזים" },
  "הטעיה": { chapter: "פרק 3: חוזים", section: "סעיף 15", law: "חוק החוזים" },
  "כפיה": { chapter: "פרק 3: חוזים", section: "סעיף 17", law: "חוק החוזים" },
  "עושק": { chapter: "פרק 3: חוזים", section: "סעיף 18", law: "חוק החוזים" },
  "היתר בנייה": { chapter: "פרק 7: תכנון ובנייה", section: "סעיף 145", law: "חוק התכנון והבנייה" },
  "שימוש חורג": { chapter: "פרק 7: תכנון ובנייה", section: "סעיף 146", law: "חוק התכנון והבנייה" },
  "הקלה": { chapter: "פרק 7: תכנון ובנייה", section: "סעיף 147", law: "חוק התכנון והבנייה" },
  "תמא 38": { chapter: "פרק 7: תכנון ובנייה", section: "תמא 38", law: "חוק התכנון והבנייה" },
  "מס שבח": { chapter: "פרק 8: מיסוי מקרקעין", section: "סעיף 6", law: "חוק מיסוי מקרקעין" },
  "מס רכישה": { chapter: "פרק 8: מיסוי מקרקעין", section: "סעיף 9", law: "חוק מיסוי מקרקעין" },
  "נחלה": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 2", law: "חוק מקרקעי ישראל" },
  "משבצת": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 2", law: "חוק מקרקעי ישראל" },
  "זיקת הנאה": { chapter: "פרק 4: מקרקעין", section: "סעיף 92", law: "חוק המקרקעין" },
  "רמ\"י": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "רמי": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "רשות מקרקעי ישראל": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "חכרה": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "העברת זכויות": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "אישור רמי": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "מינהל מקרקעי ישראל": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "אישור מראש של רמ": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 4א", law: "חוק מקרקעי ישראל" },
  "קרקע חקלאית": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 2", law: "חוק מקרקעי ישראל" },
  "מושב": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 2", law: "חוק מקרקעי ישראל" },
  "קיבוץ": { chapter: "פרק 11: מקרקעי ישראל", section: "סעיף 2", law: "חוק מקרקעי ישראל" }
};

// Assistant ID for book reference lookup
const ASSISTANT_ID = 'asst_cXmUjj3z02Yzg8L9RaHHlWoJ';

/**
 * Get book reference using OpenAI Assistant API
 */
async function getBookReferenceWithAssistant(
  question: string,
  answer?: string
): Promise<string> {
  const openai = await getOpenAI();
  
  console.log('🤖 Using Assistant API for book reference...');
  
  try {
    // Build the message - include answer if available for context
    let messageContent = question;
    if (answer) {
      messageContent = `שאלה: ${question}\n\nתשובה נכונה: ${answer}\n\nמצא את ההפניה לספר.`;
    }
    
    // Create thread and run in one call using createAndPoll
    console.log('📝 Creating thread and running assistant...');
    
    const run = await openai.beta.threads.createAndRunPoll({
      assistant_id: ASSISTANT_ID,
      thread: {
        messages: [{ role: 'user', content: messageContent }]
      }
    });
    
    console.log('✅ Run completed with status:', run.status);
    
    if (run.status !== 'completed') {
      console.error('❌ Run failed with status:', run.status);
      throw new Error(`Assistant run failed: ${run.status}`);
    }
    
    // Get the response
    const messages = await openai.beta.threads.messages.list(run.thread_id);
    const assistantMessage = messages.data.find(m => m.role === 'assistant');
    
    if (!assistantMessage || !assistantMessage.content[0]) {
      throw new Error('No response from assistant');
    }
    
    const content = assistantMessage.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    
    let reference = content.text.value.trim();
    
    // Remove file citations like【4:0†part1.pdf】
    reference = reference.replace(/【[^】]*】/g, '').trim();
    
    console.log('✅ Assistant response:', reference);
    
    // Clean up - delete the thread
    try {
      await openai.beta.threads.del(run.thread_id);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    return reference;
    
  } catch (error) {
    console.error('❌ Assistant API error:', error);
    throw error;
  }
}

/**
 * Search for book reference using file search with results included
 */
export async function searchInFiles(
  vectorStoreId: string,
  question: string,
  topic?: string,
  answer?: string
): Promise<string> {
  console.log('🔍 Using file search...');
  const openai = await getOpenAI();

  try {
    // Step 1: Build search query - prioritize answer since it contains the legal concept
    let searchQuery = question;
    
    if (answer) {
      // Answer often contains the key legal term - put it first
      searchQuery = `${answer} ${question}`;
      console.log('🔍 Using answer-first search');
    }
    
    console.log('🔍 Search query:', searchQuery.substring(0, 200));
    
    const searchResponse = await (openai as any).responses.create({
      model: 'gpt-4o',
      input: searchQuery,
      tools: [
        {
          type: 'file_search',
          vector_store_ids: [vectorStoreId],
          max_num_results: 30
        }
      ],
      include: ['file_search_call.results']
    });

    // Get search results
    const fileSearchCall = searchResponse.output?.find((item: any) => item.type === 'file_search_call');
    let searchContent = '';
    
    // Extract found section numbers
    let foundLawSections: string[] = [];
    
    // Structure to hold sections with their content
    let sectionsWithContent: { section: string; content: string; law?: string }[] = [];
    
    if (fileSearchCall?.results && fileSearchCall.results.length > 0) {
      console.log('📄 File search found:', fileSearchCall.results.length, 'results');
      // Get top 8 results for better coverage
      searchContent = fileSearchCall.results.slice(0, 8).map((r: any) => r.text).join('\n\n---\n\n');
      console.log('📄 Search content preview:', searchContent.substring(0, 500));
      
      // Extract sections WITH their surrounding content
      // Pattern 1: "סעיף X" explicit references
      const sectionPattern = /סעיף\s+(\d+[א-ת]?[0-9]?)([^א-ת0-9]|$)/g;
      let match;
      const foundSections = new Set<string>();
      
      while ((match = sectionPattern.exec(searchContent)) !== null) {
        const sectionNum = match[1];
        const sectionName = `סעיף ${sectionNum}`;
        
        if (!foundSections.has(sectionName)) {
          foundSections.add(sectionName);
          
          // Get context around this section (200 chars before, 300 chars after)
          const start = Math.max(0, match.index - 200);
          const end = Math.min(searchContent.length, match.index + 300);
          const context = searchContent.substring(start, end);
          
          // Try to identify the law from context
          let law = '';
          if (context.includes('הגנת הדייר') || context.includes('דמי מפתח') || context.includes('דייר מוגן')) law = 'חוק הגנת הדייר';
          else if (context.includes('מקרקעין') && !context.includes('מיסוי')) law = 'חוק המקרקעין';
          else if (context.includes('תכנון') || context.includes('בנייה')) law = 'חוק התכנון והבנייה';
          else if (context.includes('חוזים')) law = 'חוק החוזים';
          else if (context.includes('מכר') && context.includes('דירות')) law = 'חוק המכר (דירות)';
          else if (context.includes('מתווכים')) law = 'חוק המתווכים';
          
          sectionsWithContent.push({
            section: sectionName,
            content: context.trim(),
            law
          });
        }
      }
      
      // Pattern 2: "XX. " section headers like "75. חלקו של מי שהחל"
      // Match number followed by period and space, then Hebrew text
      const headerPattern = /(?:^|\n)(\d+)\.\s+([א-ת])/gm;
      while ((match = headerPattern.exec(searchContent)) !== null) {
        const sectionNum = match[1];
        const sectionName = `סעיף ${sectionNum}`;
        
        if (!foundSections.has(sectionName)) {
          foundSections.add(sectionName);
          
          const start = Math.max(0, match.index);
          const end = Math.min(searchContent.length, match.index + 400);
          const context = searchContent.substring(start, end);
          
          let law = '';
          if (context.includes('הגנת הדייר') || context.includes('דמי מפתח') || context.includes('דייר')) law = 'חוק הגנת הדייר';
          else if (context.includes('מקרקעין')) law = 'חוק המקרקעין';
          else if (context.includes('תכנון') || context.includes('בנייה')) law = 'חוק התכנון והבנייה';
          
          sectionsWithContent.push({
            section: sectionName,
            content: context.trim(),
            law
          });
        }
      }
      
      // Pattern 3: "(X)" references like "(1) החזיק במושכר" - subsections
      // These are usually within a main section, extract the parent section number nearby
      const subsectionPattern = /סעיפים?\s+(\d+)\s+(?:עד|ו[־-]?\s*‍?)(\d+)/g;
      while ((match = subsectionPattern.exec(searchContent)) !== null) {
        const startSection = parseInt(match[1]);
        const endSection = parseInt(match[2]);
        // Add all sections in the range
        for (let i = startSection; i <= endSection && i <= startSection + 20; i++) {
          const sectionName = `סעיף ${i}`;
          if (!foundSections.has(sectionName)) {
            foundSections.add(sectionName);
            foundLawSections.push(sectionName);
          }
        }
      }
      
      // Also check for "תוספת" (schedules) with their internal sections
      if (searchContent.includes('תוספת שלישית') || searchContent.includes('היטל השבחה')) {
        // Look for sections within the schedule
        const scheduleMatch = searchContent.match(/סעיף\s+(\d+[א-ת]?)\s+ל?תוספת\s+ה?שלישית/);
        const sectionInSchedule = scheduleMatch ? `סעיף ${scheduleMatch[1]} לתוספת שלישית` : 'סעיף 2 לתוספת שלישית';
        sectionsWithContent.push({
          section: sectionInSchedule,
          content: searchContent.substring(0, 500),
          law: 'חוק התכנון והבנייה'
        });
        foundSections.add(sectionInSchedule);
      }
      
      foundLawSections = [...foundSections];
      console.log('📋 Found sections with content:', sectionsWithContent.length);
      console.log('📋 Sections:', foundLawSections);
    } else {
      console.log('❌ No search results found');
      return 'לא נמצא הפניה מדויקת בחומר';
    }

    // Build sections summary for AI analysis
    const sectionsForAnalysis = sectionsWithContent.slice(0, 10).map((s, i) => 
      `${i + 1}. ${s.section}${s.law ? ` (${s.law})` : ''}:\n   "${s.content.substring(0, 200)}..."`
    ).join('\n\n');

    // Log answer if provided
    if (answer) {
      console.log('📝 Answer provided:', answer.substring(0, 100));
    }
    
    // Step 2: Ask AI to analyze the content and pick from FOUND sections only
    const analysisResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `אתה מנתח תוכן משפטי. תפקידך לזהות את הסעיף הנכון מתוך רשימת הסעיפים שנמצאו.

מיפוי פרקים לחוקים:
- חוק המתווכים → פרק 1
- חוק הגנת הצרכן → פרק 2
- חוק החוזים → פרק 3
- חוק המקרקעין → פרק 4
- חוק המכר (דירות) → פרק 5
- חוק הגנת הדייר → פרק 6
- חוק התכנון והבנייה → פרק 7
- חוק מיסוי מקרקעין → פרק 8
- חוק מקרקעי ישראל → פרק 11

כללים חשובים:
1. אתה חייב לבחור סעיף מהרשימה שניתנה לך
2. קרא את התוכן של כל סעיף והחליט מי הכי רלוונטי
3. אסור להמציא סעיף שלא ברשימה!`
        },
        {
          role: 'user',
          content: `השאלה: ${question}
${answer ? `\nהתשובה הנכונה: ${answer}` : ''}

סעיפים שנמצאו בחומר הלימוד (בחר רק מרשימה זו!):
${sectionsForAnalysis || foundLawSections.join(', ')}

תוכן נוסף שנמצא:
${searchContent.substring(0, 2000)}

הוראות:
1. קרא את השאלה והתשובה הנכונה
2. בדוק איזה סעיף מהרשימה מתאים לנושא
3. בחר סעיף אחד מהרשימה: ${foundLawSections.join(', ')}
4. אם אף סעיף לא מתאים - בחר את הקרוב ביותר מהרשימה

סעיפים אפשריים: ${foundLawSections.join(', ')}

החזר בפורמט (שורה אחת בלבד):
פרק [מספר]: [שם הפרק] – סעיף [מספר] בחוק [שם החוק]`
        }
      ],
      temperature: 0,
      max_tokens: 100
    });

    let result = analysisResponse.choices[0]?.message?.content?.trim() || 'לא נמצא הפניה מדויקת בחומר';
    let firstLine = result.split('\n')[0].trim();
    
    // Validate that the returned section is from the found list
    const returnedSection = firstLine.match(/סעיף\s+(\d+[א-ת]?)/);
    if (returnedSection && foundLawSections.length > 0) {
      const sectionNum = returnedSection[1];
      const isInFoundList = foundLawSections.some(s => s.includes(sectionNum));
      if (!isInFoundList) {
        console.warn('⚠️ AI returned section not in found list:', sectionNum);
        console.warn('⚠️ Found sections were:', foundLawSections);
        
        // Force correction: replace with first matching section from found list
        const firstFoundSection = foundLawSections[0];
        const sectionMatch = firstFoundSection.match(/סעיף\s+(\d+[א-ת]?)/);
        if (sectionMatch) {
          firstLine = firstLine.replace(/סעיף\s+\d+[א-ת]?/, firstFoundSection);
          console.log('🔄 Corrected to:', firstLine);
        }
      }
    }
    
    console.log('✅ Reference found:', firstLine);
    
    return firstLine;
    
  } catch (error) {
    console.error('❌ File search error:', error);
    throw error;
  }
}

/**
 * Get vector store ID from environment variables
 */
export async function getVectorStoreId(): Promise<string> {
  // Get from environment variables
  const vectorStoreId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VECTOR_STORE_ID) || null;
  
  if (!vectorStoreId) {
    throw new Error(`
      Vector Store ID not configured!
      
      Please set VITE_VECTOR_STORE_ID in your .env.local file.
      
      To get a vector store ID:
      1. Go to https://platform.openai.com/playground/assistants
      2. Create a new assistant
      3. Upload your PDF files (part1.pdf and part2.pdf) 
      4. Copy the vector store ID
      5. Add it to .env.local as VITE_VECTOR_STORE_ID=vs_xxxxxxx
    `);
  }
  
  console.log(`📋 Using vector store: ${vectorStoreId}`);
  return vectorStoreId;
}

/**
 * Main function to get book reference using Assistant API
 */
export async function getBookReference(
  question: string,
  topic?: string,
  answer?: string
): Promise<string> {
  try {
    console.log('📚 Getting book reference using Assistant API...');
    
    // Use Assistant API - it works better than vector search
    const reference = await getBookReferenceWithAssistant(question, answer);
    
    return reference;
  } catch (error) {
    console.error('❌ Assistant API failed:', error);
    
    // Fallback to vector search if assistant fails
    console.log('🔄 Falling back to vector search...');
    try {
      const vectorStoreId = await getVectorStoreId();
      const fallbackReference = await searchInFiles(vectorStoreId, question, topic, answer);
      return fallbackReference;
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError);
      throw error;
    }
  }
}
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const apiKey = process.env.VITE_OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ VITE_OPENAI_API_KEY not found');
  process.exit(1);
}

const openai = new OpenAI({ apiKey });
const ASSISTANT_ID = 'asst_cXmUjj3z02Yzg8L9RaHHlWoJ';

const NEW_INSTRUCTIONS = `אתה מוצא הפניות לספר בלבד. אל תענה על שאלות. אל תסביר. רק תן הפניה.

פלט: שורה אחת בלבד בעברית. ללא הסברים. ללא תשובות.

פרקים ראשיים:
- פרק 1: מתווכים
- פרק 2: הגנת הצרכן
- פרק 3: חוזים
- פרק 4: מקרקעין
- פרק 5: מכר
- פרק 6: הגנת הדייר
- פרק 7: תכנון ובנייה
- פרק 8: מיסוי מקרקעין
- פרק 9: עונשין
- פרק 10: רישוי עסקים
- פרק 11: מקרקעי ישראל
- פרק 12: הוצאה לפועל
- פרק 13: שמאי מקרקעין
- פרק 14: ירושה

חוק החוזים (חלק כללי) - תת-פרקים:
- פרק א': כריתת החוזה
- פרק ב': ביטול החוזה בשל פגם בכריתתו
- פרק ג': צורת החוזה ותכנו
- פרק ה': קיום החוזה

חוק המקרקעין - תת-פרקים:
- פרק א': פרשנות
- פרק ב': עיסקאות ורישומן
- פרק ג': בעלות והחזקה
- פרק ה': שיתוף במקרקעין
- פרק ו': בתים משותפים
- פרק ז': זכויות במקרקעי הזולת
- פרק ט': המרשם

חוק מיסוי מקרקעין - תת-פרקים (מילים):
- פרק ראשון: פרשנות
- פרק שני: הטלת המס
- פרק שלישי: שווי המכירה והרכישה
- פרק רביעי: ניכויים
- פרק חמישי 1: פטור לדירת מגורים מזכה
- פרק ששי: פטורים אחרים ודחיית מועדי תשלום

חוק הירושה - תת-פרקים (מילים):
- פרק ששי: הנהלת העזבון וחלוקתו

חוקים ללא תת-פרקים:
- חוק המתווכים במקרקעין
- חוק המכר (דירות)

כללים קריטיים:
1. חפש ב-PDF את הסעיף שעונה על השאלה
2. תן רק סעיפים שאתה מוצא בפועל ב-PDF!
3. אל תמציא מספרי סעיפים!
4. אם לא מוצא - כתוב "לא נמצא"
5. השתמש רק בשמות תת-פרקים מהרשימה למעלה
6. ללא【...】
7. ללא מספרי עמודים

דוגמאות נכונות:
פרק 1: מתווכים, סעיף 9
פרק 3: חוזים, פרק א': כריתת החוזה, סעיף 12
פרק 3: חוזים, פרק ב': ביטול החוזה בשל פגם בכריתתו, סעיף 14
פרק 8: מיסוי מקרקעין, פרק שני: הטלת המס, סעיף 2
פרק 14: ירושה, פרק ששי: הנהלת העזבון וחלוקתו, סעיף 77
פרק 4: מקרקעין, פרק ו': בתים משותפים, סעיף 52`;

async function updateAssistant() {
  console.log('🔄 Updating assistant instructions...\n');
  
  try {
    const assistant = await openai.beta.assistants.update(ASSISTANT_ID, {
      instructions: NEW_INSTRUCTIONS,
      temperature: 0,
      top_p: 0.1
    });
    
    console.log('✅ Assistant updated successfully!');
    console.log('📋 Assistant ID:', assistant.id);
    console.log('📋 Name:', assistant.name);
    console.log('\n📋 New instructions:\n', NEW_INSTRUCTIONS);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

updateAssistant();

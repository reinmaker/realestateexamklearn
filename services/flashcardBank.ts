import { Flashcard } from '../types';

const flashcardBank: Flashcard[] = [
    {
        question: "מהם שלושת התנאים המצטברים לזכאות דמי תיווך?",
        answer: "1. רישיון תיווך בתוקף. 2. חתימת הלקוח על הזמנה בכתב. 3. המתווך היה הגורם היעיל בעסקה."
    },
    {
        question: "מהי 'הערת אזהרה'?",
        answer: "רישום בטאבו שנועד להזהיר צדדים שלישיים על קיום התחייבות כתובה לעשות עסקה בנכס, ובכך למנוע עסקאות סותרות."
    },
    {
        question: "מהי תקופת הבלעדיות המרבית למכירת דירה על ידי מתווך?",
        answer: "תקופת הבלעדיות למכירת דירה לא תעלה על שישה חודשים מיום החתימה על ההזמנה."
    }
];

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function getRandomFlashcards(count: number): Flashcard[] {
    const shuffled = shuffle([...flashcardBank]);
    return shuffled.slice(0, count);
}

/**
 * Service for fetching and grading pre-generated questions
 */
import { GeneratedQuestion, GradeResult } from '../types';

const API_BASE_URL = import.meta.env.DEV 
  ? 'http://localhost:8888/.netlify/functions' 
  : '/.netlify/functions';

/**
 * Fetch generated questions from API
 */
export async function fetchGeneratedQuestions(
  docId: string = 'part1-2020',
  limit: number = 25
): Promise<GeneratedQuestion[]> {
  try {
    const url = `${API_BASE_URL}/questions?doc_id=${encodeURIComponent(docId)}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch questions: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching generated questions:', error);
    return [];
  }
}

/**
 * Grade a selected answer
 */
export async function gradeAnswer(
  questionId: number,
  selectedIndex: number
): Promise<GradeResult | null> {
  try {
    const url = `${API_BASE_URL}/grade`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question_id: questionId,
        selected_index: selectedIndex,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to grade answer: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error grading answer:', error);
    return null;
  }
}


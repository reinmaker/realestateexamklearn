import { Chat } from "@google/genai";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface Flashcard {
  question: string;
  answer: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type ViewType = 'home' | 'quiz' | 'flashcards' | 'chat' | 'exam';

export interface ChatSession {
  chat: Chat;
  history: ChatMessage[];
}

export interface QuizResult {
  question: string;
  isCorrect: boolean;
  explanation: string;
  topic?: string; // Topic category for tracking
}

export interface AnalysisResult {
    strengths: string[];
    weaknesses: string[];
    recommendations: string;
}

export interface QuizProgress {
  currentQuestionIndex: number;
  selectedAnswer: number | null;
  showAnswer: boolean;
  score: number;
  isFinished: boolean;
}

export interface FlashcardsProgress {
  currentIndex: number;
  userAnswers: string[];
}
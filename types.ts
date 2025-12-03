import { Chat } from "@google/genai";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  bookReference?: string; // Reference to book chapter and page, e.g., "חלק 1 - פרק 1: מתווכים, עמוד 1"
}

export interface Flashcard {
  question: string;
  answer: string;
  bookReference?: string; // Reference to book chapter and page, e.g., "חלק 1 - פרק 1: מתווכים, עמוד 1"
}

export interface GeneratedQuestion {
  id: number;
  doc_id: string;
  page: number;
  question: string; // Already includes reference string
  ref_title: string;
  ref_note: string;
  choices: string[]; // Array of 4 options
  difficulty?: string;
  tags?: string[];
}

export interface GradeResult {
  correct: boolean;
  explanation: string;
  reference: string;
  page: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export type ViewType = 'home' | 'quiz' | 'reinforcement-quiz' | 'flashcards' | 'chat' | 'exam' | 'support' | 'admin';

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

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  payment_bypassed?: boolean;
  hasValidPayment?: boolean;
  paymentStatus?: 'paid' | 'not_paid' | 'expired' | 'pending' | 'bypassed';
  paymentExpiresAt?: string | null;
}

export interface UserDetails {
  id: string;
  email: string | null;
  name: string | null;
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  stats: any | null;
  sessions: any[];
  topic_progress: any[];
  support_tickets: any[];
}

export interface QuoteLineItem {
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface PricingQuote {
  id: string;
  quote_number: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  quote_date: string;
  valid_until: string | null;
  line_items: QuoteLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  terms: string | null;
  notes: string | null;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  show_price_summary?: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
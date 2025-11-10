import React, { useState } from 'react';
import { GeneratedQuestion, GradeResult } from '../types';
import { gradeAnswer } from '../services/generatedQuestionsService';

interface GeneratedQuestionsViewProps {
  questions: GeneratedQuestion[];
}

const GeneratedQuestionsView: React.FC<GeneratedQuestionsViewProps> = ({ questions }) => {
  const [gradedQuestions, setGradedQuestions] = useState<Map<number, GradeResult>>(new Map());
  const [selectedAnswers, setSelectedAnswers] = useState<Map<number, number>>(new Map());

  const handleOptionSelect = async (questionId: number, optionIndex: number) => {
    // Don't allow changing answer after grading
    if (gradedQuestions.has(questionId)) {
      return;
    }

    // Set selected answer
    setSelectedAnswers(prev => new Map(prev).set(questionId, optionIndex));

    // Grade the answer
    const result = await gradeAnswer(questionId, optionIndex);
    if (result) {
      setGradedQuestions(prev => new Map(prev).set(questionId, result));
    }
  };

  const getPdfUrl = (page: number) => {
    // Link to PDF with page anchor
    return `/pdf/part1.pdf#page=${page}`;
  };

  if (questions.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        אין שאלות זמינות כרגע
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold mb-4">שאלות מתוך הספר</h2>
      
      {questions.map((q) => {
        const isGraded = gradedQuestions.has(q.id);
        const selectedIndex = selectedAnswers.get(q.id);
        const gradeResult = gradedQuestions.get(q.id);

        return (
          <div
            key={q.id}
            className="bg-white rounded-lg shadow-md p-6 border border-gray-200"
          >
            {/* Question text (already includes reference) */}
            <div className="mb-4">
              <p className="text-lg font-semibold mb-2">{q.question}</p>
              
              {/* Page reference link */}
              <a
                href={getPdfUrl(q.page)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                עמ׳ {q.page}
              </a>
            </div>

            {/* Options */}
            <div className="space-y-2 mb-4">
              {q.choices.map((choice, index) => {
                const isSelected = selectedIndex === index;
                const isCorrect = isGraded && gradeResult?.correct && index === selectedIndex;
                const isWrong = isGraded && !gradeResult?.correct && index === selectedIndex;
                const showCorrect = isGraded && !gradeResult?.correct && index !== selectedIndex;

                let optionClass = "p-3 border rounded-lg cursor-pointer transition-all ";
                if (isGraded) {
                  if (isCorrect) {
                    optionClass += "bg-green-100 border-green-500";
                  } else if (isWrong) {
                    optionClass += "bg-red-100 border-red-500";
                  } else if (showCorrect) {
                    optionClass += "bg-green-50 border-green-300";
                  } else {
                    optionClass += "bg-gray-50 border-gray-300 cursor-not-allowed";
                  }
                } else {
                  optionClass += isSelected
                    ? "bg-blue-50 border-blue-500"
                    : "bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50";
                }

                return (
                  <label
                    key={index}
                    className={optionClass}
                    onClick={() => !isGraded && handleOptionSelect(q.id, index)}
                  >
                    <input
                      type="radio"
                      name={`question-${q.id}`}
                      value={index}
                      checked={isSelected}
                      onChange={() => {}}
                      disabled={isGraded}
                      className="mr-2"
                    />
                    <span className="mr-2">
                      {String.fromCharCode(65 + index)}. {/* A, B, C, D */}
                    </span>
                    <span>{choice}</span>
                    {isGraded && (
                      <span className="mr-2">
                        {isCorrect && "✓ נכון"}
                        {isWrong && "✗ שגוי"}
                        {showCorrect && "✓ התשובה הנכונה"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Explanation (shown after grading) */}
            {isGraded && gradeResult && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="font-semibold mb-2">
                  {gradeResult.correct ? 'תשובה נכונה!' : 'תשובה שגויה'}
                </p>
                {gradeResult.explanation && (
                  <p className="text-gray-700 mb-2">{gradeResult.explanation}</p>
                )}
                <p className="text-sm text-gray-600">{gradeResult.reference}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GeneratedQuestionsView;


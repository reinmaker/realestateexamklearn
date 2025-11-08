import React, { useState, useEffect } from 'react';

interface ExamDate {
  date: Date;
  name: string;
  registrationStart?: Date;
  registrationEnd?: Date;
}

const EXAM_DATES: ExamDate[] = [
  {
    date: new Date('2025-11-16'),
    name: 'מועד סתיו 2025',
    registrationEnd: new Date('2025-10-16'),
  },
  {
    date: new Date('2026-02-22'),
    name: 'מועד חורף 2026',
    registrationStart: new Date('2025-12-22'),
    registrationEnd: new Date('2026-01-22'),
  },
  {
    date: new Date('2026-05-10'),
    name: 'מועד אביב 2026',
    registrationStart: new Date('2026-03-10'),
    registrationEnd: new Date('2026-04-12'),
  },
  {
    date: new Date('2026-07-29'),
    name: 'מועד קיץ 2026',
    registrationStart: new Date('2026-05-28'),
    registrationEnd: new Date('2026-06-28'),
  },
  {
    date: new Date('2026-11-15'),
    name: 'מועד סתיו 2026',
    registrationStart: new Date('2026-09-15'),
    registrationEnd: new Date('2026-10-15'),
  },
];

const ExamCountdown: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [nextExam, setNextExam] = useState<ExamDate | null>(null);

  useEffect(() => {
    const findNextExam = (): ExamDate | null => {
      const now = new Date();
      // Find the first exam date that is in the future
      for (const exam of EXAM_DATES) {
        if (exam.date > now) {
          return exam;
        }
      }
      return null;
    };

    const updateCountdown = () => {
      const exam = findNextExam();
      setNextExam(exam);

      if (!exam) {
        setTimeLeft(null);
        return;
      }

      const now = new Date();
      const diff = exam.date.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!nextExam || !timeLeft) {
    return null;
  }

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="pt-2 pb-4 border-t border-slate-600 border-b border-slate-600">
      <div className="text-center">
        <p className="text-xs font-semibold text-slate-400 mb-2">{nextExam.name}</p>
        <p className="text-xs text-slate-500 mb-3">תאריך בחינה: {formatDate(nextExam.date)}</p>
        
        <div className="bg-slate-600/50 rounded-xl p-3 mb-2">
          <p className="text-xs text-slate-300 mb-2">נותרו עד הבחינה:</p>
          <div className="flex items-center justify-center gap-2 flex-row-reverse">
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-white">{timeLeft.days}</span>
              <span className="text-xs text-slate-400">ימים</span>
            </div>
            <span className="text-slate-500">:</span>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-white">{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-xs text-slate-400">שעות</span>
            </div>
            <span className="text-slate-500">:</span>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-white">{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-xs text-slate-400">דקות</span>
            </div>
            <span className="text-slate-500">:</span>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-white">{String(timeLeft.seconds).padStart(2, '0')}</span>
              <span className="text-xs text-slate-400">שניות</span>
            </div>
          </div>
        </div>

        {nextExam.registrationEnd && (
          <p className="text-xs text-slate-500">
            סיום הרשמה: {formatDate(nextExam.registrationEnd)}
          </p>
        )}
      </div>
    </div>
  );
};

export default ExamCountdown;


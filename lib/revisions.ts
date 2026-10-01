import {
  addDays,
  differenceInCalendarDays,
  format,
  isBefore,
  isValid,
  isSameDay,
  parseISO,
  startOfToday,
} from 'date-fns';
import type {
  DSAQuestion,
  Difficulty,
  RevisionInterval,
  RevisionStage,
} from '@/types/tracker';

export const INTERVALS = [3, 7, 15, 30, 60, 120] as const satisfies readonly RevisionInterval[];

export function dateKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

export function activityDate(value: string): string {
  const parsed = parseISO(value);
  return isValid(parsed) ? dateKey(parsed) : value.slice(0, 10);
}

export function calculateMilestones(baseDateStr: string): Record<RevisionInterval, RevisionStage> {
  const baseDate = parseISO(baseDateStr);
  return INTERVALS.reduce((acc, interval) => {
    acc[interval] = {
      intervalDays: interval,
      targetDate: format(addDays(baseDate, interval), 'yyyy-MM-dd'),
      completed: false,
    };
    return acc;
  }, {} as Record<RevisionInterval, RevisionStage>);
}

export function evaluateQuestionDueStatus(
  stages: Record<RevisionInterval, RevisionStage>,
  today = startOfToday(),
) {
  let isDueToday = false;
  let isOverdue = false;

  for (const interval of INTERVALS) {
    const stage = stages[interval];
    if (!stage || stage.completed) continue;
    const stageDate = parseISO(stage.targetDate);
    if (isSameDay(stageDate, today)) isDueToday = true;
    if (isBefore(stageDate, today)) isOverdue = true;
  }

  return { isDueToday, isOverdue };
}

export function getPendingStages(question: DSAQuestion, today = startOfToday()) {
  return INTERVALS.filter((interval) => {
    const stage = question.stages[interval];
    return !stage.completed && !isBefore(today, parseISO(stage.targetDate));
  });
}

export function getQuestionStatus(stages: Record<RevisionInterval, RevisionStage>): DSAQuestion['status'] {
  const completedCount = INTERVALS.filter((interval) => stages[interval]?.completed).length;
  if (completedCount === INTERVALS.length) return 'Mastered';
  return completedCount > 0 ? 'In_Review' : 'Learning';
}

export function getDifficultyXp(difficulty: Difficulty): number {
  return difficulty === 'Easy' ? 10 : difficulty === 'Medium' ? 20 : 50;
}

export function getCurrentStreak(dates: string[], today = startOfToday()): number {
  const activeDays = new Set(dates);
  let cursor = activeDays.has(dateKey(today)) ? today : addDays(today, -1);
  if (!activeDays.has(dateKey(cursor))) return 0;

  let streak = 0;
  while (activeDays.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function daysFromToday(date: string): number {
  return differenceInCalendarDays(parseISO(date), startOfToday());
}

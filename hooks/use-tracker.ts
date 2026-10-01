'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, format, isValid, parseISO, startOfToday } from 'date-fns';
import { db } from '@/lib/db';
import { calculateMilestones, getDifficultyXp, getQuestionStatus } from '@/lib/revisions';
import type { DSAQuestion, Difficulty, RevisionInterval } from '@/types/tracker';

export type NewQuestion = Pick<DSAQuestion, 'name' | 'topic' | 'difficulty' | 'solvedDate'> &
  Partial<Pick<DSAQuestion, 'problemUrl' | 'notes'>>;

export function useTracker() {
  const [questions, setQuestions] = useState<DSAQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const allQuestions = await db.questions.toArray();
      allQuestions.sort((a, b) => b.createdAt - a.createdAt);
      setQuestions(allQuestions);
      setError(null);
    } catch {
      setError('Your local database could not be opened. Please enable site storage and reload.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addQuestion = useCallback(async (input: NewQuestion) => {
    const problemUrl = input.problemUrl ? validateProblemUrl(input.problemUrl) : undefined;
    const question: DSAQuestion = {
      ...input,
      ...(problemUrl ? { problemUrl } : {}),
      id: crypto.randomUUID(),
      stages: calculateMilestones(input.solvedDate),
      status: 'Learning',
      createdAt: Date.now(),
    };
    try {
      await db.questions.add(question);
      await refresh();
      return question;
    } catch {
      setError('This question could not be saved. Check that browser storage is available.');
      throw new Error('Could not save question');
    }
  }, [refresh]);

  const completeRevision = useCallback(async (questionId: string, interval: RevisionInterval) => {
    try {
      await db.transaction('rw', db.questions, async () => {
        const question = await db.questions.get(questionId);
        if (!question) throw new Error('Question not found');
        const stages = {
          ...question.stages,
          [interval]: {
            ...question.stages[interval],
            completed: true,
            completedAt: new Date().toISOString(),
          },
        };
        await db.questions.update(questionId, { stages, status: getQuestionStatus(stages) });
      });
      await refresh();
    } catch {
      setError('That revision could not be saved. Please try again.');
      throw new Error('Could not complete revision');
    }
  }, [refresh]);

  const postponeRevision = useCallback(async (questionId: string, interval: RevisionInterval) => {
    try {
      await db.transaction('rw', db.questions, async () => {
        const question = await db.questions.get(questionId);
        if (!question) throw new Error('Question not found');
        const stage = question.stages[interval];
        const targetDate = format(addDays(startOfToday(), 1), 'yyyy-MM-dd');
        await db.questions.update(questionId, {
          stages: {
            ...question.stages,
            [interval]: {
              ...stage,
              originalTargetDate: stage.originalTargetDate ?? stage.targetDate,
              targetDate,
            },
          },
        });
      });
      await refresh();
    } catch {
      setError('The reminder could not be postponed. Please try again.');
      throw new Error('Could not postpone revision');
    }
  }, [refresh]);

  const deleteQuestion = useCallback(async (questionId: string) => {
    try {
      await db.questions.delete(questionId);
      await refresh();
    } catch {
      setError('This question could not be removed. Please try again.');
      throw new Error('Could not delete question');
    }
  }, [refresh]);

  const importQuestions = useCallback(async (data: unknown) => {
    if (!Array.isArray(data)) throw new Error('Import must be a JSON array of questions.');
    const records: DSAQuestion[] = data.map((row, index) => normalizeImportedQuestion(row, index));
    try {
      await db.questions.bulkPut(records);
      await refresh();
      return records.length;
    } catch {
      setError('The import could not be saved to local storage.');
      throw new Error('Could not import questions');
    }
  }, [refresh]);

  const xp = questions.reduce((total, question) => {
    const solved = getDifficultyXp(question.difficulty);
    const revisions = Object.values(question.stages).filter((stage) => stage.completed).length * 15;
    return total + solved + revisions;
  }, 0);

  return {
    questions,
    loading,
    error,
    xp,
    refresh,
    addQuestion,
    completeRevision,
    postponeRevision,
    deleteQuestion,
    importQuestions,
    clearError: () => setError(null),
  };
}

function normalizeImportedQuestion(row: unknown, index: number): DSAQuestion {
  if (!row || typeof row !== 'object') throw new Error(`Row ${index + 1} is not a question object.`);
  const item = row as Record<string, unknown>;
  const name = String(item.name ?? item['Question Name'] ?? '').trim();
  const solvedDate = String(item.solvedDate ?? item['Date Solved'] ?? '').slice(0, 10);
  const difficulty = item.difficulty;
  const allowedDifficulties: Difficulty[] = ['Easy', 'Medium', 'Hard'];
  if (!name || !isDateKey(solvedDate)) {
    throw new Error(`Row ${index + 1} needs a question name and valid solved date.`);
  }
  if (difficulty != null && !allowedDifficulties.includes(difficulty as Difficulty)) {
    throw new Error(`Row ${index + 1} has an unsupported difficulty.`);
  }

  const stages = calculateMilestones(solvedDate);
  const importedStages = item.stages ?? item.Revisions;
  for (const interval of [3, 7, 15, 30, 60, 120] as const) {
    const imported = importedStages && typeof importedStages === 'object'
      ? (importedStages as Record<string, unknown>)[interval]
      : undefined;
    if (imported && typeof imported === 'object') {
      const stage = imported as Record<string, unknown>;
      const targetDate = stage.targetDate == null ? stages[interval].targetDate : String(stage.targetDate);
      if (!isDateKey(targetDate)) throw new Error(`Row ${index + 1} has an invalid +${interval} day date.`);
      const originalTargetDate = typeof stage.originalTargetDate === 'string' ? stage.originalTargetDate : undefined;
      if (originalTargetDate && !isDateKey(originalTargetDate)) {
        throw new Error(`Row ${index + 1} has an invalid original +${interval} day date.`);
      }
      stages[interval] = {
        ...stages[interval],
        targetDate,
        ...(originalTargetDate ? { originalTargetDate } : {}),
        completed: stage.completed === true,
        ...(typeof stage.completedAt === 'string' ? { completedAt: stage.completedAt } : {}),
      };
    } else {
      const excelDate = item[`+${interval} Days`];
      if (excelDate != null && !isDateKey(String(excelDate).slice(0, 10))) {
        throw new Error(`Row ${index + 1} has an invalid +${interval} day date.`);
      }
      if (excelDate != null) stages[interval] = { ...stages[interval], targetDate: String(excelDate).slice(0, 10) };
    }
  }

  const question = {
    id: String(item.id ?? item.ID ?? '').trim() || crypto.randomUUID(),
    name,
    topic: String(item.topic ?? item.Topic ?? 'Other'),
    difficulty: (difficulty && allowedDifficulties.includes(difficulty as Difficulty)
      ? difficulty
      : item.Difficulty && allowedDifficulties.includes(item.Difficulty as Difficulty)
        ? item.Difficulty
        : 'Medium') as Difficulty,
    solvedDate,
    stages,
    status: 'Learning' as DSAQuestion['status'],
    createdAt: Number(item.createdAt) || Date.now() + index,
    ...(item.problemUrl || item['Problem URL']
      ? { problemUrl: validateProblemUrl(String(item.problemUrl ?? item['Problem URL'])) }
      : {}),
    ...(item.notes || item.Notes ? { notes: String(item.notes ?? item.Notes) } : {}),
  };
  question.status = getQuestionStatus(stages);
  return question;
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
}

function validateProblemUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    return url.toString();
  } catch {
    throw new Error('Problem links must use a valid http or https URL.');
  }
}

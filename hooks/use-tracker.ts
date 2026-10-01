'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, format, isBefore, isValid, parseISO, startOfToday } from 'date-fns';
import { db } from '@/lib/db';
import { activityDate, calculateMilestones, dateKey, getDifficultyXp, getQuestionStatus, INTERVALS } from '@/lib/revisions';
import type {
  DSAQuestion,
  Difficulty,
  PracticeLogEntry,
  RevisionInterval,
  StreakMilestone,
  UserSettings,
} from '@/types/tracker';

export type NewQuestion = Pick<DSAQuestion, 'name' | 'topic' | 'difficulty' | 'solvedDate'> &
  Partial<Pick<DSAQuestion, 'problemUrl' | 'notes'>>;

export const STREAK_MILESTONES: Omit<StreakMilestone, 'unlocked' | 'unlockedAt'>[] = [
  { days: 3, title: 'Finding your rhythm', badge: '🌱' },
  { days: 7, title: 'A week of recall', badge: '🔥' },
  { days: 14, title: 'Two-week streak', badge: '⚡' },
  { days: 30, title: 'Consistency champion', badge: '🏆' },
  { days: 60, title: 'Recall specialist', badge: '💎' },
  { days: 100, title: 'Century of learning', badge: '👑' },
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  email: 'newharsh818@gmail.com',
  emailNotificationsEnabled: false,
  preferredEmailTime: '08:00',
  streakFreezeAvailable: 1,
  soundEnabled: true,
};

export function useTracker() {
  const [questions, setQuestions] = useState<DSAQuestion[]>([]);
  const [practiceLogs, setPracticeLogs] = useState<PracticeLogEntry[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [milestones, setMilestones] = useState<StreakMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [allQuestions, allPracticeLogs, storedSettings, allMilestones] = await Promise.all([
        db.questions.toArray(),
        db.practiceLogs.orderBy('date').reverse().toArray(),
        db.settings.get('user'),
        db.milestones.toArray(),
      ]);
      allQuestions.sort((a, b) => b.createdAt - a.createdAt);
      setQuestions(allQuestions);
      setPracticeLogs(allPracticeLogs);
      setSettings(storedSettings?.value ?? DEFAULT_USER_SETTINGS);
      setMilestones(allMilestones);
      setError(null);
    } catch (cause) {
      console.error('AlgoRecall could not load local tracker data.', cause);
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

  const savePracticeLog = useCallback(async (
    input: Pick<PracticeLogEntry, 'date' | 'questionsSolvedCount' | 'revisionsCompletedCount' | 'notes'>,
    manualOverride = false,
    previousDate = input.date,
  ) => {
    if (!isDateKey(input.date) || input.date > dateKey()) throw new Error('Choose a valid date no later than today.');
    if (!isDateKey(previousDate)) throw new Error('The existing practice log date is invalid.');
    if (![input.questionsSolvedCount, input.revisionsCompletedCount].every(
      (count) => Number.isInteger(count) && count >= 0 && count <= 500,
    )) throw new Error('Practice counts must be whole numbers between 0 and 500.');
    const notes = input.notes?.trim();
    if (notes && notes.length > 500) throw new Error('Practice notes must be 500 characters or fewer.');

    try {
      let entry!: PracticeLogEntry;
      await db.transaction('rw', db.practiceLogs, async () => {
        const existing = await db.practiceLogs.get(previousDate);
        if (previousDate !== input.date && await db.practiceLogs.get(input.date)) {
          throw new Error('A practice log already exists for that date.');
        }
        entry = {
          id: input.date,
          date: input.date,
          questionsSolvedCount: input.questionsSolvedCount,
          revisionsCompletedCount: input.revisionsCompletedCount,
          ...(manualOverride && (input.questionsSolvedCount + input.revisionsCompletedCount > 0 || existing?.manualOverride)
            ? { manualOverride: true }
            : {}),
          ...(notes ? { notes } : {}),
        };
        await db.practiceLogs.put(entry);
        if (previousDate !== input.date) await db.practiceLogs.delete(previousDate);
      });
      await refresh();
      return entry;
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('already exists')) throw cause;
      console.error('AlgoRecall could not save a practice log.', cause);
      setError('The practice log could not be saved. Please try again.');
      throw new Error('Could not save practice log');
    }
  }, [refresh]);

  const saveSettings = useCallback(async (update: Partial<UserSettings>) => {
    const next = { ...settings, ...update };
    if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      throw new Error('Enter a valid email address.');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.preferredEmailTime)) {
      throw new Error('Choose a valid reminder time.');
    }
    try {
      await db.settings.put({ id: 'user', value: next });
      await refresh();
    } catch (cause) {
      console.error('AlgoRecall could not save user settings.', cause);
      setError('Your settings could not be saved. Please try again.');
      throw new Error('Could not save settings');
    }
  }, [refresh, settings]);

  const useStreakFreeze = useCallback(async (date: string) => {
    if (!isDateKey(date) || date >= dateKey()) throw new Error('A streak freeze can only repair a past day.');
    try {
      await db.transaction('rw', db.questions, db.practiceLogs, db.settings, async () => {
        const stored = await db.settings.get('user');
        const currentSettings = stored?.value ?? DEFAULT_USER_SETTINGS;
        if (currentSettings.streakFreezeAvailable < 1) throw new Error('No streak freezes are available.');
        const [allQuestions, existingLog] = await Promise.all([
          db.questions.toArray(),
          db.practiceLogs.get(date),
        ]);
        const alreadyActive = Boolean(existingLog && (
          existingLog.manualOverride || existingLog.questionsSolvedCount + existingLog.revisionsCompletedCount > 0
        ))
          || allQuestions.some((question) =>
            question.solvedDate === date
            || Object.values(question.stages).some((stage) => stage.completedAt && activityDate(stage.completedAt) === date),
          );
        if (alreadyActive) throw new Error('That day already has practice recorded.');
        await db.practiceLogs.put({
          id: date,
          date,
          questionsSolvedCount: 0,
          revisionsCompletedCount: 0,
          manualOverride: true,
          notes: [existingLog?.notes, 'Streak freeze used'].filter(Boolean).join(' · '),
        });
        await db.settings.put({
          id: 'user',
          value: { ...currentSettings, streakFreezeAvailable: currentSettings.streakFreezeAvailable - 1 },
        });
      });
      await refresh();
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('streak freeze')) throw cause;
      console.error('AlgoRecall could not apply the streak freeze.', cause);
      setError('The streak freeze could not be applied. Please try again.');
      throw new Error(cause instanceof Error ? cause.message : 'Could not apply streak freeze');
    }
  }, [refresh]);

  const awardMilestones = useCallback(async (streak: number) => {
    try {
      const unlocked: StreakMilestone[] = [];
      await db.transaction('rw', db.milestones, async () => {
        for (const milestone of STREAK_MILESTONES) {
          if (streak < milestone.days || await db.milestones.get(milestone.days)) continue;
          const record: StreakMilestone = { ...milestone, unlocked: true, unlockedAt: new Date().toISOString() };
          await db.milestones.put(record);
          unlocked.push(record);
        }
      });
      if (unlocked.length) await refresh();
      return unlocked;
    } catch (cause) {
      console.error('AlgoRecall could not record streak achievements.', cause);
      setError('A streak achievement could not be saved.');
      throw new Error('Could not save streak achievement');
    }
  }, [refresh]);

  const rescheduleDueStages = useCallback(async (mode: 'catch-up' | 'postpone') => {
    const today = startOfToday();
    const targetDate = format(mode === 'catch-up' ? today : addDays(today, 3), 'yyyy-MM-dd');
    try {
      await db.transaction('rw', db.questions, async () => {
        const allQuestions = await db.questions.toArray();
        for (const question of allQuestions) {
          const stages = { ...question.stages };
          let changed = false;
          for (const interval of INTERVALS) {
            const stage = stages[interval];
            if (stage.completed || isBefore(today, parseISO(stage.targetDate))) continue;
            if (mode === 'catch-up' && stage.targetDate === targetDate) continue;
            stages[interval] = {
              ...stage,
              originalTargetDate: stage.originalTargetDate ?? stage.targetDate,
              targetDate,
            };
            changed = true;
          }
          if (changed) await db.questions.update(question.id, { stages });
        }
      });
      await refresh();
    } catch (cause) {
      console.error('AlgoRecall could not reschedule due revisions.', cause);
      setError('Due revisions could not be rescheduled. Please try again.');
      throw new Error('Could not reschedule due revisions');
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
    const backup = Array.isArray(data) ? undefined : normalizeImportedBackup(data);
    const questionRows = Array.isArray(data) ? data : backup?.questions;
    if (!questionRows) throw new Error('Import must be a question array or an AlgoRecall backup.');
    const records: DSAQuestion[] = questionRows.map((row, index) => normalizeImportedQuestion(row, index));
    const importedLogs = backup?.practiceLogs?.map(normalizeImportedPracticeLog) ?? [];
    const importedMilestones = backup?.milestones ? normalizeImportedMilestones(backup.milestones) : [];
    const importedSettings = backup && backup.settings !== undefined
      ? normalizeImportedSettings(backup.settings)
      : undefined;
    try {
      await db.transaction('rw', db.questions, db.practiceLogs, db.settings, db.milestones, async () => {
        await db.questions.bulkPut(records);
        if (importedLogs.length) await db.practiceLogs.bulkPut(importedLogs);
        if (importedSettings) await db.settings.put({ id: 'user', value: importedSettings });
        if (importedMilestones.length) await db.milestones.bulkPut(importedMilestones);
      });
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
    practiceLogs,
    settings,
    milestones,
    loading,
    error,
    xp,
    refresh,
    addQuestion,
    completeRevision,
    postponeRevision,
    savePracticeLog,
    saveSettings,
    useStreakFreeze,
    awardMilestones,
    rescheduleDueStages,
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

function normalizeImportedBackup(value: unknown): {
  questions: unknown[];
  practiceLogs?: unknown[];
  settings?: unknown;
  milestones?: unknown[];
} | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const backup = value as Record<string, unknown>;
  if (backup.schemaVersion !== 2 || !Array.isArray(backup.questions)) {
    throw new Error('This is not a supported AlgoRecall backup.');
  }
  if (backup.practiceLogs !== undefined && !Array.isArray(backup.practiceLogs)) {
    throw new Error('Backup practice logs must be an array.');
  }
  if (backup.milestones !== undefined && !Array.isArray(backup.milestones)) {
    throw new Error('Backup milestones must be an array.');
  }
  return {
    questions: backup.questions,
    ...(backup.practiceLogs ? { practiceLogs: backup.practiceLogs } : {}),
    ...(backup.settings !== undefined ? { settings: backup.settings } : {}),
    ...(backup.milestones ? { milestones: backup.milestones } : {}),
  };
}

function normalizeImportedPracticeLog(row: unknown, index: number): PracticeLogEntry {
  if (!row || typeof row !== 'object') throw new Error(`Practice log ${index + 1} is invalid.`);
  const item = row as Record<string, unknown>;
  const date = String(item.date ?? '');
  const questionsSolvedCount = Number(item.questionsSolvedCount);
  const revisionsCompletedCount = Number(item.revisionsCompletedCount);
  if (!isDateKey(date) || date > dateKey()
    || ![questionsSolvedCount, revisionsCompletedCount].every((count) => Number.isInteger(count) && count >= 0 && count <= 500)) {
    throw new Error(`Practice log ${index + 1} has an invalid date or count.`);
  }
  if (item.notes !== undefined && (typeof item.notes !== 'string' || item.notes.length > 500)) {
    throw new Error(`Practice log ${index + 1} has invalid notes.`);
  }
  if (item.manualOverride !== undefined && typeof item.manualOverride !== 'boolean') {
    throw new Error(`Practice log ${index + 1} has an invalid override flag.`);
  }
  return {
    id: date,
    date,
    questionsSolvedCount,
    revisionsCompletedCount,
    ...(item.manualOverride === true ? { manualOverride: true } : {}),
    ...(typeof item.notes === 'string' && item.notes.trim() ? { notes: item.notes.trim() } : {}),
  };
}

function normalizeImportedSettings(value: unknown): UserSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Backup settings are invalid.');
  }
  const item = value as Record<string, unknown>;
  const email = typeof item.email === 'string' ? item.email.trim() : undefined;
  const preferredEmailTime = String(item.preferredEmailTime ?? '');
  const streakFreezeAvailable = Number(item.streakFreezeAvailable);
  if ((email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || typeof item.emailNotificationsEnabled !== 'boolean'
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredEmailTime)
    || !Number.isInteger(streakFreezeAvailable)
    || streakFreezeAvailable < 0
    || streakFreezeAvailable > 500
    || typeof item.soundEnabled !== 'boolean') {
    throw new Error('Backup settings contain invalid values.');
  }
  return {
    ...(email ? { email } : {}),
    emailNotificationsEnabled: item.emailNotificationsEnabled,
    preferredEmailTime,
    streakFreezeAvailable,
    soundEnabled: item.soundEnabled,
  };
}

function normalizeImportedMilestones(value: unknown[]): StreakMilestone[] {
  const knownMilestones = new Map(STREAK_MILESTONES.map((milestone) => [milestone.days, milestone]));
  const imported = new Map<number, StreakMilestone>();
  value.forEach((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`Streak trophy ${index + 1} is invalid.`);
    const item = row as Record<string, unknown>;
    const canonical = knownMilestones.get(Number(item.days));
    if (!canonical || item.unlocked !== true
      || typeof item.unlockedAt !== 'string'
      || !Number.isFinite(Date.parse(item.unlockedAt))) {
      throw new Error(`Streak trophy ${index + 1} contains invalid data.`);
    }
    imported.set(canonical.days, { ...canonical, unlocked: true, unlockedAt: item.unlockedAt });
  });
  return [...imported.values()];
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

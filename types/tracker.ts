export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type RevisionInterval = 3 | 7 | 15 | 30 | 60 | 120;

export interface RevisionStage {
  intervalDays: RevisionInterval;
  targetDate: string;
  originalTargetDate?: string;
  completed: boolean;
  completedAt?: string;
}

export interface DSAQuestion {
  id: string;
  name: string;
  problemUrl?: string;
  topic: string;
  difficulty: Difficulty;
  solvedDate: string;
  stages: Record<RevisionInterval, RevisionStage>;
  status: 'Learning' | 'In_Review' | 'Mastered';
  notes?: string;
  createdAt: number;
}

export interface PracticeLogEntry {
  id: string;
  date: string;
  questionsSolvedCount: number;
  revisionsCompletedCount: number;
  manualOverride?: boolean;
  notes?: string;
}

export interface StreakMilestone {
  days: number;
  title: string;
  badge: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface UserSettings {
  email?: string;
  emailNotificationsEnabled: boolean;
  preferredEmailTime: string;
  streakFreezeAvailable: number;
  soundEnabled: boolean;
}

export interface StoredUserSettings {
  id: string;
  value: UserSettings;
}

export interface UserStats {
  streak: number;
  lastActiveDate: string;
  totalSolved: number;
  xp: number;
}

export type QuestionDueState = {
  isDueToday: boolean;
  isOverdue: boolean;
};

export type ExportQuestion = {
  'Question Name': string;
  'Date Solved': string;
  '+3 Days': string;
  '+7 Days': string;
  '+15 Days': string;
  '+30 Days': string;
  '+60 Days': string;
  '+120 Days': string;
  Status: string;
  'Due Today?': 'Yes' | 'No';
  Topic: string;
  Difficulty: Difficulty;
  'Problem URL'?: string;
  Notes?: string;
  Revisions: Record<RevisionInterval, { targetDate: string; originalTargetDate?: string; completed: boolean; completedAt?: string }>;
};

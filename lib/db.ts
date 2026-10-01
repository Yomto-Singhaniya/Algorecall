import Dexie, { type Table } from 'dexie';
import type {
  DSAQuestion,
  PracticeLogEntry,
  StreakMilestone,
  StoredUserSettings,
} from '@/types/tracker';

class AlgoRecallDatabase extends Dexie {
  questions!: Table<DSAQuestion, string>;
  practiceLogs!: Table<PracticeLogEntry, string>;
  milestones!: Table<StreakMilestone, number>;
  settings!: Table<StoredUserSettings, string>;

  constructor() {
    super('algorecall');
    this.version(1).stores({
      questions: 'id, solvedDate, difficulty, topic, status',
    });
    this.version(2).stores({
      questions: 'id, solvedDate, difficulty, topic, status',
      practiceLogs: 'id, date',
      milestones: 'days',
      settings: '&id',
    });
  }
}

export const db = new AlgoRecallDatabase();

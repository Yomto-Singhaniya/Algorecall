import Dexie, { type Table } from 'dexie';
import type { DSAQuestion } from '@/types/tracker';

class AlgoRecallDatabase extends Dexie {
  questions!: Table<DSAQuestion, string>;

  constructor() {
    super('algorecall');
    this.version(1).stores({
      questions: 'id, solvedDate, difficulty, topic, status',
    });
  }
}

export const db = new AlgoRecallDatabase();

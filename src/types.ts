export type Kind = 'task' | 'schedule';
export type Priority = 0 | 1 | 2 | 3;
export type TabKey = 'today' | 'month' | 'todos' | 'settings';

export interface Todo {
  id: string;
  title: string;
  memo: string;
  kind: Kind;
  /** Format YYYY-MM-DD (waktu lokal). null = tanpa tanggal (hanya untuk task). */
  date: string | null;
  /** Menit sejak 00:00. Hanya untuk schedule. */
  startMin: number | null;
  endMin: number | null;
  priority: Priority;
  category: string | null;
  color: string;
  goalId: string | null;
  /** Indeks pengingat: 0 tanpa, 1 saat mulai, 2 = 5 mnt, 3 = 15 mnt, 4 = 1 jam sebelum. Kosong = 0. */
  reminder?: number;
  /** Indeks pengulangan: 0 tidak pernah, 1 harian, 2 mingguan, 3 bulanan. Kosong = 0. */
  repeat?: number;
  done: boolean;
  createdAt: number;
  doneAt: number | null;
}

export type TodoInput = Omit<Todo, 'id' | 'done' | 'createdAt' | 'doneAt'>;

export interface Goal {
  id: string;
  title: string;
  color: string;
  createdAt: number;
}

export interface SheetOptions {
  editing?: Todo;
  kind?: Kind;
  date?: string | null;
}

export type OpenSheet = (options?: SheetOptions) => void;
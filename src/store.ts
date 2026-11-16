import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { palette } from './theme';
import type { Goal, Todo, TodoInput } from './types';
import {
  dropAllReminders,
  dropReminder,
  startReminderSync,
  syncReminder,
} from './utils/reminder';

interface State {
  todos: Todo[];
  goals: Goal[];
  highContrast: boolean;

  addTodo: (input: TodoInput) => void;
  updateTodo: (id: string, patch: Partial<TodoInput>) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;

  addGoal: (title: string) => void;
  removeGoal: (id: string) => void;

  setHighContrast: (value: boolean) => void;
  clearDone: () => void;
  resetAll: () => void;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      todos: [],
      goals: [],
      highContrast: true,

      addTodo: (input) => {
        const todo: Todo = { ...input, id: uid(), done: false, createdAt: Date.now(), doneAt: null };
        set((s) => ({ todos: [...s.todos, todo] }));
        void syncReminder(todo);
      },

      updateTodo: (id, patch) => {
        set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
        const updated = get().todos.find((t) => t.id === id);
        if (updated) void syncReminder(updated);
      },

      toggleTodo: (id) => {
        set((s) => ({
          todos: s.todos.map((t) =>
            t.id === id
              ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null }
              : t,
          ),
        }));
        // Selesai -> pengingat dibatalkan; dibuka lagi -> dijadwalkan ulang.
        const toggled = get().todos.find((t) => t.id === id);
        if (toggled) void syncReminder(toggled);
      },

      removeTodo: (id) => {
        set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
        void dropReminder(id);
      },

      addGoal: (title) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        const color = palette[get().goals.length % palette.length];
        set((s) => ({
          goals: [...s.goals, { id: uid(), title: trimmed, color, createdAt: Date.now() }],
        }));
      },

      removeGoal: (id) =>
        set((s) => ({
          goals: s.goals.filter((g) => g.id !== id),
          todos: s.todos.map((t) => (t.goalId === id ? { ...t, goalId: null } : t)),
        })),

      setHighContrast: (value) => set({ highContrast: value }),
      // Todo yang sudah selesai pengingatnya sudah dibatalkan saat dicentang.
      clearDone: () => set((s) => ({ todos: s.todos.filter((t) => !t.done) })),
      resetAll: () => {
        set({ todos: [], goals: [] });
        void dropAllReminders();
      },
    }),
    {
      name: 'tempo-store-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ todos: s.todos, goals: s.goals, highContrast: s.highContrast }),
    },
  ),
);

/** true setelah data dari AsyncStorage selesai dimuat. */
export function useHydrated() {
  const [ready, setReady] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setReady(true));
    setReady(useStore.persist.hasHydrated());
    return unsub;
  }, []);
  return ready;
}

/**
 * Setelah data termuat: siapkan notifikasi dan pasang ulang jadwal semua pengingat.
 * Dijalankan lagi setiap app kembali aktif, supaya jadwal ke depan (terutama di iOS
 * yang dibatasi 64 notifikasi) selalu terisi.
 */
const bootReminders = () => startReminderSync(() => useStore.getState().todos);
if (useStore.persist.hasHydrated()) bootReminders();
else useStore.persist.onFinishHydration(bootReminders);
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth, db, isConfigPlaceholder } from './firebase';
import { useStore } from './store';
import type { Goal, Todo } from './types';

// Bersihkan properti undefined jika ada sebelum simpan ke Firestore
function cleanData<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

let unsubTodos: (() => void) | null = null;
let unsubGoals: (() => void) | null = null;
let unsubSettings: (() => void) | null = null;
let currentUid: string | null = null;

// Flag untuk mencegah feedback loop saat state di-update dari snapshot Firestore
let isSyncingFromRemote = false;

/**
 * Inisialisasi sinkronisasi otomatis realtime antara Local Store (Zustand) dan Cloud Firestore.
 * Berjalan otomatis di latar belakang tanpa perlu aksi manual.
 */
export function initFirebase(): () => void {
  if (isConfigPlaceholder) {
    console.warn(
      '[Tempo Firebase] Kredensial Firebase belum terkonfigurasi. Pastikan .env sudah terisi.',
    );
    return () => {};
  }

  // 1. Monitor status autentikasi pengguna secara otomatis
  const unsubAuth = onAuthStateChanged(
    auth,
    async (user) => {
      // Bersihkan listener sebelumnya jika user berubah
      unsubTodos?.();
      unsubGoals?.();
      unsubSettings?.();
      unsubTodos = null;
      unsubGoals = null;
      unsubSettings = null;

      if (!user) {
        try {
          // Login secara anonim otomatis (ID unik dan persisten di perangkat)
          await signInAnonymously(auth);
        } catch (err) {
          console.warn('[Tempo Firebase] Info autentikasi anonim:', err);
        }
        return;
      }

      currentUid = user.uid;
      // Mulai mendengarkan data realtime dari Firestore
      subscribeToFirestore(user.uid);
    },
    (error) => {
      console.warn('[Tempo Firebase] Auth notice:', error);
    },
  );

  // 2. Subscribe ke perubahan Zustand store lokal dan otomatis push setiap perubahan ke Firestore secara realtime
  const unsubStore = useStore.subscribe((state, prevState) => {
    if (isSyncingFromRemote || !currentUid) return;

    // Sinkronisasi otomatis realtime Todos
    if (state.todos !== prevState.todos) {
      syncTodosToFirestore(currentUid, state.todos, prevState.todos);
    }

    // Sinkronisasi otomatis realtime Goals
    if (state.goals !== prevState.goals) {
      syncGoalsToFirestore(currentUid, state.goals, prevState.goals);
    }

    // Sinkronisasi preferensi (highContrast)
    if (state.highContrast !== prevState.highContrast) {
      const settingsRef = doc(db, 'users', currentUid, 'settings', 'preferences');
      setDoc(settingsRef, { highContrast: state.highContrast }, { merge: true }).catch(() => {});
    }
  });

  return () => {
    unsubAuth();
    unsubStore();
    unsubTodos?.();
    unsubGoals?.();
    unsubSettings?.();
  };
}

/**
 * Mendengarkan perubahan Firestore secara realtime untuk Todos, Goals, dan Preferensi.
 */
function subscribeToFirestore(uid: string) {
  const todosCol = collection(db, 'users', uid, 'todos');
  const goalsCol = collection(db, 'users', uid, 'goals');
  const settingsDocRef = doc(db, 'users', uid, 'settings', 'preferences');

  let initialTodosProcessed = false;
  let initialGoalsProcessed = false;

  // 1. Realtime Listener untuk Todos
  unsubTodos = onSnapshot(
    todosCol,
    (snapshot) => {
      const remoteTodos: Todo[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<Todo, 'id'>),
        id: d.id,
      }));

      // Pada sinkronisasi awal, lakukan rekonsiliasi agar data lokal tidak hilang
      if (!initialTodosProcessed) {
        initialTodosProcessed = true;
        const localTodos = useStore.getState().todos;
        const remoteIdSet = new Set(remoteTodos.map((t) => t.id));
        const localOnlyTodos = localTodos.filter((t) => !remoteIdSet.has(t.id));

        if (localOnlyTodos.length > 0) {
          uploadTodosBatch(uid, localOnlyTodos);
          remoteTodos.push(...localOnlyTodos);
        }
      }

      remoteTodos.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

      try {
        isSyncingFromRemote = true;
        useStore.setState({ todos: remoteTodos });
      } finally {
        queueMicrotask(() => {
          isSyncingFromRemote = false;
        });
      }
    },
    (err) => {
      console.warn('[Tempo Firebase] Firestore notice (todos):', err);
    },
  );

  // 2. Realtime Listener untuk Goals
  unsubGoals = onSnapshot(
    goalsCol,
    (snapshot) => {
      const remoteGoals: Goal[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<Goal, 'id'>),
        id: d.id,
      }));

      if (!initialGoalsProcessed) {
        initialGoalsProcessed = true;
        const localGoals = useStore.getState().goals;
        const remoteIdSet = new Set(remoteGoals.map((g) => g.id));
        const localOnlyGoals = localGoals.filter((g) => !remoteIdSet.has(g.id));

        if (localOnlyGoals.length > 0) {
          uploadGoalsBatch(uid, localOnlyGoals);
          remoteGoals.push(...localOnlyGoals);
        }
      }

      remoteGoals.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

      try {
        isSyncingFromRemote = true;
        useStore.setState({ goals: remoteGoals });
      } finally {
        queueMicrotask(() => {
          isSyncingFromRemote = false;
        });
      }
    },
    (err) => {
      console.warn('[Tempo Firebase] Firestore notice (goals):', err);
    },
  );

  // 3. Realtime Listener untuk Pengaturan / Preferensi
  unsubSettings = onSnapshot(
    settingsDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (typeof data?.highContrast === 'boolean') {
          if (useStore.getState().highContrast !== data.highContrast) {
            try {
              isSyncingFromRemote = true;
              useStore.setState({ highContrast: data.highContrast });
            } finally {
              queueMicrotask(() => {
                isSyncingFromRemote = false;
              });
            }
          }
        }
      } else {
        const currentHighContrast = useStore.getState().highContrast;
        setDoc(settingsDocRef, { highContrast: currentHighContrast }, { merge: true }).catch(() => {});
      }
    },
    () => {},
  );
}

/**
 * Sinkronisasi incremental Todos lokal -> Firestore secara realtime
 */
function syncTodosToFirestore(uid: string, current: Todo[], previous: Todo[]) {
  const prevMap = new Map(previous.map((t) => [t.id, t]));
  const currMap = new Map(current.map((t) => [t.id, t]));

  // Tambah / Update dokumen ke Firestore
  for (const todo of current) {
    const prev = prevMap.get(todo.id);
    if (!prev || prev !== todo) {
      const { id, ...data } = todo;
      const todoDocRef = doc(db, 'users', uid, 'todos', id);
      setDoc(todoDocRef, cleanData(data)).catch((err) =>
        console.warn(`[Tempo Firebase] Simpan todo (${id}):`, err),
      );
    }
  }

  // Hapus dokumen dari Firestore
  for (const prev of previous) {
    if (!currMap.has(prev.id)) {
      const todoDocRef = doc(db, 'users', uid, 'todos', prev.id);
      deleteDoc(todoDocRef).catch((err) =>
        console.warn(`[Tempo Firebase] Hapus todo (${prev.id}):`, err),
      );
    }
  }
}

/**
 * Sinkronisasi incremental Goals lokal -> Firestore secara realtime
 */
function syncGoalsToFirestore(uid: string, current: Goal[], previous: Goal[]) {
  const prevMap = new Map(previous.map((g) => [g.id, g]));
  const currMap = new Map(current.map((g) => [g.id, g]));

  // Tambah / Update dokumen ke Firestore
  for (const goal of current) {
    const prev = prevMap.get(goal.id);
    if (!prev || prev !== goal) {
      const { id, ...data } = goal;
      const goalDocRef = doc(db, 'users', uid, 'goals', id);
      setDoc(goalDocRef, cleanData(data)).catch((err) =>
        console.warn(`[Tempo Firebase] Simpan goal (${id}):`, err),
      );
    }
  }

  // Hapus dokumen dari Firestore
  for (const prev of previous) {
    if (!currMap.has(prev.id)) {
      const goalDocRef = doc(db, 'users', uid, 'goals', prev.id);
      deleteDoc(goalDocRef).catch((err) =>
        console.warn(`[Tempo Firebase] Hapus goal (${prev.id}):`, err),
      );
    }
  }
}

/**
 * Batch upload untuk data inisial Todos
 */
async function uploadTodosBatch(uid: string, todos: Todo[]) {
  if (todos.length === 0) return;
  const batch = writeBatch(db);
  for (const todo of todos) {
    const { id, ...data } = todo;
    const ref = doc(db, 'users', uid, 'todos', id);
    batch.set(ref, cleanData(data));
  }
  try {
    await batch.commit();
  } catch (err) {
    console.warn('[Tempo Firebase] Inisial todos batch notice:', err);
  }
}

/**
 * Batch upload untuk data inisial Goals
 */
async function uploadGoalsBatch(uid: string, goals: Goal[]) {
  if (goals.length === 0) return;
  const batch = writeBatch(db);
  for (const goal of goals) {
    const { id, ...data } = goal;
    const ref = doc(db, 'users', uid, 'goals', id);
    batch.set(ref, cleanData(data));
  }
  try {
    await batch.commit();
  } catch (err) {
    console.warn('[Tempo Firebase] Inisial goals batch notice:', err);
  }
}

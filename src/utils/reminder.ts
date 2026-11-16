import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Todo } from '../types';
import {
  cancelAllSystemAlarms,
  cancelSystemAlarms,
  ensureAlarmPermission,
  scheduleSystemAlarms,
} from './alarms';
import { minToDate } from './date';

/**
 * Selisih menit sebelum mulai. Urutannya HARUS sama dengan REMINDERS di AddSheet:
 * ['Tanpa', 'Saat mulai', '5 mnt sebelum', '15 mnt sebelum', '1 jam sebelum']
 */
export const REMINDER_OFFSETS: (number | null)[] = [null, 0, 5, 15, 60];

/**
 * Urutan sama dengan REPEATS di AddSheet: tidak pernah, harian, mingguan, bulanan.
 * iOS hanya menyimpan 64 notifikasi terjadwal dan membuang sisanya tanpa pesan,
 * jadi di iOS jumlah jadwal ke depan dibuat lebih sedikit dan dibatasi total.
 */
const REPEAT_COUNT = Platform.OS === 'ios' ? [1, 7, 4, 3] : [1, 14, 8, 6];
const IOS_PENDING_LIMIT = 60;

/**
 * Ubah ke true agar pengingat menembus mode Fokus di iOS 15+. Wajib menambah
 * `ios.entitlements["com.apple.developer.usernotifications.time-sensitive"] = true`
 * di app.json dan akun developer berbayar, kalau tidak build iOS bisa gagal.
 */
const IOS_TIME_SENSITIVE = false;

const CHANNEL_ID = 'reminders';
/** Tugas yang hanya punya tanggal (tanpa jam) diingatkan jam 09.00. */
const DEFAULT_START_MIN = 9 * 60;

let setupPromise: Promise<void> | null = null;

/** Siapkan handler dan channel. Aman dipanggil berulang (hanya berjalan sekali). */
export function setupNotifications(): Promise<void> {
  if (!setupPromise) setupPromise = doSetup();
  return setupPromise;
}

async function doSetup() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    const base = { name: 'Pengingat', importance: Notifications.AndroidImportance.MAX };
    // Dicoba dari yang paling lengkap ke yang paling sederhana. Beberapa lingkungan
    // (mis. Expo Go) menolak opsi tertentu dengan NullPointerException; kegagalan di sini
    // tidak boleh membuat pengingat mati total.
    const attempts: Notifications.NotificationChannelInput[] = [
      {
        ...base,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        // Bunyi seperti alarm (mengikuti volume alarm), bukan volume notifikasi biasa.
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      },
      { ...base, vibrationPattern: [0, 250, 250, 250], sound: 'default' },
      base,
    ];
    for (let i = 0; i < attempts.length; i++) {
      try {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, attempts[i]);
        if (i > 0) console.warn(`[reminders] channel dibuat dengan konfigurasi sederhana (tahap ${i + 1})`);
        return;
      } catch (e) {
        if (i === attempts.length - 1) console.warn('[reminders] channel gagal dibuat', e);
      }
    }
  }
}

/** Minta izin notifikasi kalau belum ada. Mengembalikan true bila diizinkan. */
let permissionInflight: Promise<boolean> | null = null;

export function ensureNotificationPermission(): Promise<boolean> {
  // Panggilan bersamaan berbagi satu permintaan, supaya dialog izin tidak muncul dua kali.
  if (!permissionInflight) {
    permissionInflight = (async () => {
      try {
        // Di Android 13+ channel harus sudah ada sebelum izin diminta.
        await setupNotifications();
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) return true;
        if (!current.canAskAgain) return false;
        const next = await Notifications.requestPermissionsAsync();
        return next.granted;
      } catch (e) {
        console.warn('[reminders] gagal memeriksa izin', e);
        return false;
      }
    })().finally(() => {
      permissionInflight = null;
    });
  }
  return permissionInflight;
}

/** Izin untuk pengingat: cukup notifikasi ATAU alarm (AlarmKit di iOS 26+) yang diizinkan. */
export async function ensureReminderPermission(): Promise<boolean> {
  const notif = await ensureNotificationPermission();
  const alarm = await ensureAlarmPermission();
  return notif || alarm;
}

/** Buka pengaturan notifikasi app (dipakai bila izin sudah ditolak; iOS tidak mau bertanya dua kali). */
export function openNotificationSettings() {
  return Linking.openSettings();
}

/** Batalkan semua pengingat milik satu todo (dipakai saat edit, hapus, atau selesai). */
export async function cancelReminders(todoId: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.content.data?.todoId === todoId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Geser tanggal; untuk bulanan, tanggal 31 dijepit ke hari terakhir bulan tujuan. */
function shift(base: Date, repeatIdx: number, i: number): Date {
  const d = new Date(base);
  if (repeatIdx === 1) d.setDate(d.getDate() + i);
  else if (repeatIdx === 2) d.setDate(d.getDate() + i * 7);
  else if (repeatIdx === 3) {
    const day = base.getDate();
    d.setDate(1);
    d.setMonth(base.getMonth() + i);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d;
}

function bodyFor(offset: number) {
  if (offset === 0) return 'Mulai sekarang';
  if (offset >= 60) return `Mulai ${offset / 60} jam lagi`;
  return `Mulai ${offset} menit lagi`;
}

export interface ReminderInput {
  todoId: string;
  title: string;
  /** Warna hex todo, dipakai untuk tampilan alarm di iOS. */
  color: string;
  /** Kunci tanggal yang sama dengan yang dipakai store (todayKey/toKey). null = tanpa tanggal. */
  date: string | null;
  /** Menit sejak tengah malam; null untuk tugas tanpa jam. */
  startMin: number | null;
  /** Indeks di REMINDERS (0 = tanpa pengingat). */
  reminderIdx: number;
  /** Indeks di REPEATS (0 = tidak pernah). */
  repeatIdx: number;
}

/**
 * Jadwalkan ulang pengingat satu todo: batalkan yang lama, lalu pasang yang baru.
 * Pengulangan dijabarkan jadi beberapa jadwal ke depan (harian 14, mingguan 8, bulanan 6),
 * jadi panggil `scheduleReminder` lagi saat app dibuka supaya jadwalnya selalu terisi.
 * Mengembalikan jumlah jadwal yang terpasang.
 */
export async function scheduleReminder(
  input: ReminderInput,
  opts: { systemAlarm?: boolean } = {},
): Promise<number> {
  // systemAlarm = true hanya untuk aksi pengguna (simpan/edit). Sinkronisasi latar tidak
  // boleh membuat alarm Jam Android lagi, karena akan jadi dobel.
  const systemAlarm = opts.systemAlarm ?? false;
  await cancelReminders(input.todoId);
  await cancelSystemAlarms(input.todoId, { android: systemAlarm });

  const offset = REMINDER_OFFSETS[input.reminderIdx] ?? null;
  if (offset == null || input.date == null) return 0;

  const base = minToDate(input.date, input.startMin ?? DEFAULT_START_MIN);
  const count = REPEAT_COUNT[input.repeatIdx] ?? 1;
  const now = Date.now();

  const fires: Date[] = [];
  for (let i = 0; i < count; i++) {
    const fire = new Date(shift(base, input.repeatIdx, i).getTime() - offset * 60_000);
    if (fire.getTime() > now) fires.push(fire);
  }
  if (!fires.length) return 0;

  // Alarm sungguhan lebih dulu (AlarmKit di iOS 26+, aplikasi Jam di Android).
  // Notifikasi hanya untuk waktu bunyi yang belum tertangani alarm.
  const covered = await scheduleSystemAlarms({
    todoId: input.todoId,
    title: input.title,
    color: input.color,
    fires,
    createSystemAlarm: systemAlarm,
  });
  const remaining = fires.filter((f) => !covered.has(f.getTime()));
  if (!remaining.length) return covered.size;
  if (!(await ensureNotificationPermission())) return covered.size;

  let scheduled = 0;

  // Sisa slot di iOS (batas 64 notifikasi untuk seluruh app).
  let room = Infinity;
  if (Platform.OS === 'ios') {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    room = Math.max(IOS_PENDING_LIMIT - pending.length, 0);
  }

  for (const fire of remaining) {
    if (scheduled >= room) break;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: bodyFor(offset),
        sound: true,
        data: { todoId: input.todoId },
        ...(Platform.OS === 'ios' && IOS_TIME_SENSITIVE
          ? { interruptionLevel: 'timeSensitive' as const }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
        channelId: CHANNEL_ID,
      },
    });
    scheduled++;
  }
  return covered.size + scheduled;
}

/* ---------- API untuk store ---------- */

// Semua operasi jadwal dijalankan berurutan supaya tidak saling menimpa
// (mis. simpan todo bersamaan dengan sinkronisasi saat app dibuka).
let chain: Promise<void> = Promise.resolve();
function enqueue(fn: () => Promise<unknown>): Promise<void> {
  chain = chain.then(fn).then(
    () => undefined,
    (e) => {
      console.warn('[reminders]', e);
    },
  );
  return chain;
}

/** Samakan jadwal notifikasi dengan keadaan satu todo. Selesai = dibatalkan. */
export function syncReminder(todo: Todo): Promise<void> {
  return enqueue(async () => {
    if (todo.done) {
      await cancelReminders(todo.id);
      await cancelSystemAlarms(todo.id, { android: true });
      return;
    }
    await scheduleReminder(toInput(todo), { systemAlarm: true });
  });
}

export function dropReminder(todoId: string): Promise<void> {
  return enqueue(async () => {
    await cancelReminders(todoId);
    await cancelSystemAlarms(todoId, { android: true });
  });
}

export function dropAllReminders(): Promise<void> {
  return enqueue(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await cancelAllSystemAlarms();
  });
}

function toInput(todo: Todo): ReminderInput {
  return {
    todoId: todo.id,
    title: todo.title,
    color: todo.color,
    date: todo.date,
    startMin: todo.kind === 'schedule' ? todo.startMin : null,
    reminderIdx: todo.reminder ?? 0,
    repeatIdx: todo.repeat ?? 0,
  };
}

/** Pasang ulang semua pengingat, yang paling dekat waktunya mendapat slot lebih dulu. */
export function syncAllReminders(todos: Todo[]): Promise<void> {
  return enqueue(async () => {
    // Jangan memunculkan dialog izin saat app baru dibuka.
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;

    await Notifications.cancelAllScheduledNotificationsAsync();
    await cancelAllSystemAlarms();

    const active = todos
      .filter((t) => !t.done && t.date != null && (t.reminder ?? 0) > 0)
      .sort(
        (a, b) =>
          (a.date ?? '').localeCompare(b.date ?? '') ||
          (a.startMin ?? DEFAULT_START_MIN) - (b.startMin ?? DEFAULT_START_MIN),
      );
    for (const t of active) await scheduleReminder(toInput(t));
  });
}

let syncStarted = false;

/** Dipanggil store setelah data termuat. Menyinkronkan sekarang dan tiap app kembali aktif. */
export function startReminderSync(getTodos: () => Todo[]) {
  if (syncStarted) return;
  syncStarted = true;
  const run = () => {
    void setupNotifications()
      .then(() => syncAllReminders(getTodos()))
      .catch((e) => console.warn('[reminders]', e));
  };
  run();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });
}
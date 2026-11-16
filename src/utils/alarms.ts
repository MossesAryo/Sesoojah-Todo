import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Alarm sungguhan di atas notifikasi biasa:
 *  - iOS 26+: AlarmKit (menembus mode silent dan Fokus) lewat react-native-nitro-ios-alarm-kit.
 *  - Android: alarm di aplikasi Jam lewat intent SET_ALARM (expo-intent-launcher).
 *
 * Kedua paket itu butuh kode native (development build, bukan Expo Go). Kalau paketnya belum
 * terpasang, native module-nya tidak ada, atau perangkat tidak mendukung, semua fungsi di sini
 * diam-diam tidak melakukan apa-apa dan pemanggil jatuh kembali ke notifikasi biasa.
 */

/* ---------- Pemuat modul opsional ---------- */

interface AlarmButton {
  text: string;
  textColor: string;
  icon?: string;
}

// Tanda tangan disusun dari README library; cek terhadap tipe aslinya setelah terpasang.
interface AlarmKitModule {
  isAvailable(): boolean;
  requestAlarmPermission(): Promise<boolean>;
  scheduleFixedAlarm(
    title: string,
    stopBtn: AlarmButton,
    tintColor: string,
    secondaryBtn?: AlarmButton,
    timestamp?: number, // detik (Unix)
  ): Promise<string | null>;
  stopAlarm(alarmId: string): Promise<boolean>;
}

interface IntentLauncherModule {
  startActivityAsync(
    action: string,
    params?: { extra?: Record<string, string | number | boolean> },
  ): Promise<unknown>;
}

let alarmKit: AlarmKitModule | null | undefined;
function loadAlarmKit(): AlarmKitModule | null {
  if (alarmKit !== undefined) return alarmKit;
  alarmKit = null;
  if (Platform.OS !== 'ios') return null;
  try {
    const mod = require('react-native-nitro-ios-alarm-kit') as AlarmKitModule;
    if (mod.isAvailable()) alarmKit = mod; // false di iOS < 26
  } catch {
    // Paket belum terpasang atau berjalan di Expo Go.
  }
  return alarmKit;
}

let launcher: IntentLauncherModule | null | undefined;
function loadLauncher(): IntentLauncherModule | null {
  if (launcher !== undefined) return launcher;
  launcher = null;
  if (Platform.OS !== 'android') return null;
  try {
    launcher = require('expo-intent-launcher') as IntentLauncherModule;
  } catch {
    // Paket belum terpasang.
  }
  return launcher;
}

/* ---------- Catatan alarm per todo (untuk membatalkan nanti) ---------- */

interface Entry {
  /** ID alarm AlarmKit. */
  ios?: string[];
  /** Alarm di aplikasi Jam: label untuk mencarinya lagi dan waktu bunyinya (ms). */
  android?: { label: string; fire: number };
}

const MAP_KEY = 'tempo-alarms-v1';

async function loadMap(): Promise<Record<string, Entry>> {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}

async function saveMap(map: Record<string, Entry>) {
  try {
    await AsyncStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[alarms] gagal menyimpan catatan alarm', e);
  }
}

/* ---------- API ---------- */

const STOP_BUTTON: AlarmButton = {
  text: 'Stop',
  textColor: '#FFFFFF',
  icon: 'checkmark.circle.fill',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const shorten = (s: string, n = 20) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Minta izin AlarmKit (hanya iOS 26+). false bila tidak tersedia atau ditolak.
 * Aman dipanggil berulang: iOS tidak menampilkan dialog lagi setelah dijawab.
 */
export async function ensureAlarmPermission(): Promise<boolean> {
  const kit = loadAlarmKit();
  if (!kit) return false;
  try {
    return await kit.requestAlarmPermission();
  } catch (e) {
    console.warn('[alarms] izin alarm gagal', e);
    return false;
  }
}

export interface AlarmRequest {
  todoId: string;
  title: string;
  /** Warna hex untuk tampilan alarm di iOS. */
  color: string;
  /** Waktu bunyi yang masih di masa depan, urut dari yang terdekat. */
  fires: Date[];
  /** true bila dipicu aksi pengguna (simpan/edit), bukan sinkronisasi latar. */
  createSystemAlarm: boolean;
}

/**
 * Pasang alarm sungguhan sebisanya. Mengembalikan waktu bunyi (ms) yang sudah ditangani
 * alarm, supaya pemanggil tidak menjadwalkan notifikasi ganda untuk waktu yang sama.
 */
export async function scheduleSystemAlarms(req: AlarmRequest): Promise<Set<number>> {
  const covered = new Set<number>();
  if (!req.fires.length) return covered;

  const map = await loadMap();
  const entry: Entry = map[req.todoId] ?? {};
  const title = shorten(req.title);

  // iOS: satu alarm tetap per waktu bunyi.
  const kit = loadAlarmKit();
  if (kit) {
    try {
      if (await kit.requestAlarmPermission()) {
        const ids: string[] = [];
        for (const fire of req.fires) {
          const id = await kit.scheduleFixedAlarm(
            title,
            STOP_BUTTON,
            req.color,
            undefined,
            Math.floor(fire.getTime() / 1000),
          );
          if (!id) break; // batas alarm tercapai atau gagal; sisanya jatuh ke notifikasi
          ids.push(id);
          covered.add(fire.getTime());
        }
        if (ids.length) entry.ios = ids;
      }
    } catch (e) {
      console.warn('[alarms] AlarmKit gagal', e);
    }
  }

  // Android: intent SET_ALARM hanya mengenal jam (bukan tanggal), jadi dibatasi untuk
  // waktu bunyi dalam 24 jam. Hanya dibuat saat aksi pengguna supaya tidak dobel.
  if (Platform.OS === 'android') {
    const first = req.fires[0];
    if (req.createSystemAlarm && first.getTime() - Date.now() < DAY_MS) {
      const l = loadLauncher();
      if (l) {
        const label = `${title} ·${req.todoId.slice(-3)}`;
        try {
          await l.startActivityAsync('android.intent.action.SET_ALARM', {
            extra: {
              'android.intent.extra.alarm.HOUR': first.getHours(),
              'android.intent.extra.alarm.MINUTES': first.getMinutes(),
              'android.intent.extra.alarm.MESSAGE': label,
              'android.intent.extra.alarm.VIBRATE': true,
              'android.intent.extra.alarm.SKIP_UI': true,
            },
          });
          entry.android = { label, fire: first.getTime() };
        } catch (e) {
          console.warn('[alarms] SET_ALARM gagal', e);
        }
      }
    }
    // Alarm Jam yang masih menunggu sudah menangani waktu bunyi tersebut.
    if (entry.android && entry.android.fire > Date.now()) covered.add(entry.android.fire);
  }

  if (entry.ios || entry.android) {
    map[req.todoId] = entry;
    await saveMap(map);
  }
  return covered;
}

/**
 * Batalkan alarm milik satu todo. Alarm iOS selalu dibatalkan. Alarm di aplikasi Jam
 * hanya disentuh bila `android` true (aksi pengguna), dan itu usaha terbaik: Android
 * hanya bisa menonaktifkan alarm lewat label, bukan menghapusnya.
 */
export async function cancelSystemAlarms(todoId: string, opts: { android: boolean }) {
  const map = await loadMap();
  const entry = map[todoId];
  if (!entry) return;

  const kit = loadAlarmKit();
  if (entry.ios) {
    if (kit) {
      for (const id of entry.ios) {
        try {
          await kit.stopAlarm(id);
        } catch (e) {
          console.warn('[alarms] stopAlarm gagal', e);
        }
      }
    }
    delete entry.ios;
  }

  if (entry.android && opts.android) {
    const l = loadLauncher();
    if (l) {
      try {
        await l.startActivityAsync('android.intent.action.DISMISS_ALARM', {
          extra: {
            'android.intent.extra.alarm.SEARCH_MODE': 'android.label',
            'android.intent.extra.alarm.MESSAGE': entry.android.label,
          },
        });
      } catch (e) {
        console.warn('[alarms] DISMISS_ALARM gagal', e);
      }
    }
    delete entry.android;
  }

  if (entry.ios || entry.android) map[todoId] = entry;
  else delete map[todoId];
  await saveMap(map);
}

/** Batalkan semua alarm AlarmKit (dipakai sebelum memasang ulang semuanya). */
export async function cancelAllSystemAlarms() {
  const map = await loadMap();
  const kit = loadAlarmKit();
  for (const key of Object.keys(map)) {
    const entry = map[key];
    if (entry.ios && kit) {
      for (const id of entry.ios) {
        try {
          await kit.stopAlarm(id);
        } catch {
          // diabaikan: alarm mungkin sudah berbunyi atau dihentikan
        }
      }
    }
    delete entry.ios;
    if (!entry.android) delete map[key];
  }
  await saveMap(map);
}
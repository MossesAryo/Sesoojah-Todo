import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categories, colors, palette, priorityMeta } from '../theme';
import { useStore } from '../store';
import type { Kind, Priority, SheetOptions, Todo } from '../types';
import { MONTHS, fromKey, minOfDate, minToDate, todayKey, toKey } from '../utils/date';
import { tapLight, tapSelect, tapSuccess, tapWarning } from '../utils/haptics';
import { NativePicker } from './NativePicker';
import { Segmented } from './Segmented';
import { ensureReminderPermission, openNotificationSettings } from '../utils/reminder';

interface Props {
  visible: boolean;
  options: SheetOptions;
  onClose: () => void;
}

type Page = 'main' | 'schedule';
type Mode = 'none' | 'date' | 'timed';

type Anchor = { x: number; y: number; w: number; h: number };
type MenuItem = { label: string; dot?: string };
type MenuConfig = {
  anchor: Anchor;
  items: MenuItem[];
  selected: number;
  onSelect: (index: number) => void;
  align: 'left' | 'right';
  grid?: boolean;
};
type MenuState = MenuConfig | null;

/**
 * Tipe minimal untuk ref. React Native versi baru tidak lagi mengekspor `View`
 * sebagai tipe instance (ia fungsi komponen), jadi `useRef<View>` tidak valid.
 * Callback ref + tipe struktural ini aman di semua versi.
 */
type Measurable = {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};
type Scrollable = {
  scrollTo: (opts: { x?: number; y?: number; animated?: boolean }) => void;
};

const REPEATS = ['Tidak pernah', 'Setiap hari', 'Setiap minggu', 'Setiap bulan'];
const REMINDERS = ['Tanpa', 'Saat mulai', '5 mnt sebelum', '15 mnt sebelum', '1 jam sebelum'];

const ITEM_H = 44;
const MENU_MAX_H = 264;
const GRID_COLS = 5;

const pad = (n: number) => String(n).padStart(2, '0');
const fmtTime = (m: number) => `${pad(Math.floor(m / 60))}.${pad(m % 60)}`;
const fmtShortDate = (key: string) => {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};
const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} mnt`;
  if (!m) return `${h} j`;
  return `${h} j ${m} mnt`;
};

/** Slot 30 menit berikutnya dari sekarang (untuk default jadwal baru hari ini). */
const nextSlot = () => {
  const m = minOfDate(new Date());
  return Math.min(Math.ceil((m + 1) / 30) * 30, 23 * 60);
};

/**
 * Jalankan `cb` setelah keyboard benar-benar tertutup.
 * Di iOS, sheet masih bergeser selama animasi keyboard; kalau langsung diukur,
 * posisi dropdown meleset. Ada fallback timeout supaya tidak pernah menggantung.
 */
function afterKeyboardHidden(cb: () => void) {
  if (!Keyboard.isVisible()) {
    cb();
    return;
  }
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sub = Keyboard.addListener('keyboardDidHide', () => finish());
  function finish() {
    if (done) return;
    done = true;
    sub.remove();
    if (timer) clearTimeout(timer);
    requestAnimationFrame(cb);
  }
  timer = setTimeout(finish, 450);
  Keyboard.dismiss();
}

/** Ukur posisi sebuah view di layar (dipakai untuk menaruh dropdown). */
function useMeasure() {
  const node = useRef<Measurable | null>(null);
  const ref = useCallback((n: Measurable | null) => {
    node.current = n;
  }, []);
  const measure = useCallback((cb: (a: Anchor) => void) => {
    afterKeyboardHidden(() => {
      node.current?.measureInWindow((x, y, w, h) => cb({ x, y, w, h }));
    });
  }, []);
  return { ref, measure };
}

export function AddSheet({ visible, options, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const goals = useStore((s) => s.goals);
  const addTodo = useStore((s) => s.addTodo);
  const updateTodo = useStore((s) => s.updateTodo);
  const removeTodo = useStore((s) => s.removeTodo);

  const editing: Todo | undefined = options.editing;

  const [page, setPage] = useState<Page>('main');
  const [menu, setMenu] = useState<MenuState>(null);

  const [kind, setKind] = useState<Kind>('task');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState<string>(todayKey());
  const [useDate, setUseDate] = useState(false);
  const [startMin, setStartMin] = useState(9 * 60);
  const [endMin, setEndMin] = useState(9 * 60 + 30);
  const [noEnd, setNoEnd] = useState(false);
  const [priority, setPriority] = useState<Priority>(0);
  const [category, setCategory] = useState<string | null>(null);
  const [color, setColor] = useState(palette[0]);
  const [goalId, setGoalId] = useState<string | null>(null);

  // Disimpan di todo; jadwal notifikasinya diatur oleh store.
  const [repeatIdx, setRepeatIdx] = useState(0);
  const [reminderIdx, setReminderIdx] = useState(2);

  const goalAnchor = useMeasure();

  /* ---------- Animasi buka/tutup: backdrop fade + sheet slide ---------- */

  // `mounted` menahan Modal tetap tampil selama animasi keluar berjalan.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  const animateIn = () => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (visible) {
      // Kalau Modal belum tampil, animasi masuk dimulai dari onShow.
      if (mounted) animateIn();
      else setMounted(true);
    } else if (mounted) {
      Keyboard.dismiss();
      Animated.timing(progress, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Reset form setiap kali sheet dibuka.
  useEffect(() => {
    if (!visible) return;
    setPage('main');
    setMenu(null);
    setNoEnd(false);
    if (editing) {
      setRepeatIdx(editing.repeat ?? 0);
      setReminderIdx(editing.reminder ?? 0);
      setKind(editing.kind);
      setTitle(editing.title);
      setMemo(editing.memo);
      setDate(editing.date ?? todayKey());
      setUseDate(editing.date != null);
      setStartMin(editing.startMin ?? 9 * 60);
      setEndMin(editing.endMin ?? 9 * 60 + 30);
      setPriority(editing.priority);
      setCategory(editing.category);
      setColor(editing.color);
      setGoalId(editing.goalId);
      return;
    }
    const k = options.kind ?? 'task';
    const d = options.date ?? todayKey();
    const start = d === todayKey() ? nextSlot() : 9 * 60;
    setRepeatIdx(0);
    setReminderIdx(2);
    setKind(k);
    setTitle('');
    setMemo('');
    setDate(d);
    setUseDate(options.date != null);
    setStartMin(start);
    setEndMin(Math.min(start + 30, 24 * 60 - 1));
    setPriority(0);
    setCategory(null);
    setColor(palette[Math.floor(Math.random() * palette.length)]);
    setGoalId(null);
  }, [visible, editing, options.kind, options.date]);

  const canSave = title.trim().length > 0;
  const mode: Mode = kind === 'schedule' ? 'timed' : useDate ? 'date' : 'none';

  const setMode = (m: Mode) => {
    if (m === 'timed') {
      setKind('schedule');
    } else {
      setKind('task');
      setUseDate(m === 'date');
    }
  };

  const onStartChange = (d: Date) => {
    const v = minOfDate(d);
    setStartMin(v);
    if (endMin <= v) setEndMin(Math.min(v + 30, 24 * 60 - 1));
  };
  const onEndChange = (d: Date) => {
    const v = minOfDate(d);
    setEndMin(Math.max(v, startMin + 5));
  };

  const save = () => {
    if (!canSave) return;
    // Model jadwal butuh jam selesai, jadi "tanpa jam selesai" disimpan dengan durasi default 30 menit.
    const finalEnd = noEnd ? startMin + 30 : endMin;
    // Pengingat dan ulangi hanya berarti kalau item punya tanggal.
    const hasDate = kind === 'schedule' || useDate;
    const data = {
      title: title.trim(),
      memo: memo.trim(),
      kind,
      date: kind === 'schedule' ? date : useDate ? date : null,
      startMin: kind === 'schedule' ? startMin : null,
      endMin: kind === 'schedule' ? Math.min(Math.max(finalEnd, startMin + 5), 24 * 60) : null,
      priority,
      category,
      color,
      goalId,
      reminder: hasDate ? reminderIdx : 0,
      repeat: hasDate ? repeatIdx : 0,
    };
    if (editing) updateTodo(editing.id, data);
    else addTodo(data);
    tapSuccess();
    onClose();
  };

  const confirmDelete = () => {
    if (!editing) return;
    tapWarning();
    Alert.alert('Hapus item ini?', editing.title, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          removeTodo(editing.id);
          onClose();
        },
      },
    ]);
  };

  const goToPage = (p: Page) => {
    Keyboard.dismiss();
    setMenu(null);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPage(p);
  };

  const openSchedulePage = () => {
    tapLight();
    goToPage('schedule');
  };

  const dateValue = useMemo(() => fromKey(date), [date]);
  const startValue = useMemo(() => minToDate(date, startMin), [date, startMin]);
  const endValue = useMemo(() => minToDate(date, endMin), [date, endMin]);

  const goal = goals.find((g) => g.id === goalId) ?? null;

  const summary =
    kind === 'schedule'
      ? `${fmtShortDate(date)} · ${fmtTime(startMin)}${noEnd ? '' : ` – ${fmtTime(endMin)}`}`
      : useDate
        ? fmtShortDate(date)
        : 'Tanpa tanggal';

  const dateChipLabel = kind === 'schedule' || useDate ? fmtShortDate(date) : 'Tanggal';

  /* ---------- Izin notifikasi ---------- */

  // Diminta saat pengguna memilih pengingat (konteksnya jelas, dan sheet masih terbuka
  // sehingga Alert tampil normal di iOS). iOS hanya bertanya sekali; kalau sudah
  // ditolak, satu-satunya jalan adalah Pengaturan.
  const askReminderPermission = async () => {
    const ok = await ensureReminderPermission();
    if (ok) return;
    Alert.alert(
      'Notifikasi dimatikan',
      'Aktifkan izin notifikasi untuk Tempo di Pengaturan agar pengingat bisa berbunyi.',
      [
        { text: 'Nanti', style: 'cancel' },
        {
          text: 'Buka Pengaturan',
          onPress: () => {
            void openNotificationSettings();
          },
        },
      ],
    );
  };

  /* ---------- Definisi dropdown ---------- */

  const openGoalMenu = () => {
    tapSelect();
    goalAnchor.measure((a) =>
      setMenu({
        anchor: a,
        align: 'right',
        items: [{ label: 'Tanpa goal' }, ...goals.map((g) => ({ label: g.title, dot: g.color }))],
        selected: goalId == null ? 0 : goals.findIndex((g) => g.id === goalId) + 1,
        onSelect: (i) => setGoalId(i === 0 ? null : goals[i - 1].id),
      }),
    );
  };

  const openPriorityMenu = (a: Anchor) =>
    setMenu({
      anchor: a,
      align: 'left',
      items: ([0, 1, 2, 3] as Priority[]).map((p) => ({
        label: p === 0 ? 'Tanpa' : priorityMeta[p].label,
        dot: p === 0 ? undefined : priorityMeta[p].color,
      })),
      selected: priority,
      onSelect: (i) => setPriority(i as Priority),
    });

  const openCategoryMenu = (a: Anchor) =>
    setMenu({
      anchor: a,
      align: 'left',
      items: [{ label: 'Tanpa' }, ...categories.map((c) => ({ label: c }))],
      selected: category == null ? 0 : Math.max(categories.indexOf(category) + 1, 0),
      onSelect: (i) => setCategory(i === 0 ? null : categories[i - 1]),
    });

  const openColorMenu = (a: Anchor) =>
    setMenu({
      anchor: a,
      align: 'left',
      grid: true,
      items: palette.map((c) => ({ label: c, dot: c })),
      selected: palette.indexOf(color),
      onSelect: (i) => setColor(palette[i]),
    });

  const openRepeatMenu = (a: Anchor) =>
    setMenu({
      anchor: a,
      align: 'right',
      items: REPEATS.map((label) => ({ label })),
      selected: repeatIdx,
      onSelect: setRepeatIdx,
    });

  const openReminderMenu = (a: Anchor) =>
    setMenu({
      anchor: a,
      align: 'right',
      items: REMINDERS.map((label) => ({ label })),
      selected: reminderIdx,
      onSelect: (i) => {
        setReminderIdx(i);
        if (i > 0) void askReminderPermission();
      },
    });

  const schedulePageH = Math.min(Math.round(winH * 0.68), 480);

  const sheetTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [winH, 0],
  });

  return (
    <Modal
      visible={mounted}
      animationType="none"
      transparent
      statusBarTranslucent
      onShow={animateIn}
      onRequestClose={() => {
        if (menu) setMenu(null);
        else if (page === 'schedule') goToPage('main');
        else onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop: fade terpisah dari sheet supaya tidak ikut meluncur dari bawah */}
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: progress }]}
        />
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Tutup" />

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              maxHeight: winH - insets.top - 8,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={styles.grabber} />

          {page === 'main' ? (
            <>
              {/* Header */}
              <View style={styles.header}>
                <Pressable
                  style={({ pressed }) => [styles.circleBtn, pressed && styles.pressed]}
                  onPress={onClose}
                  accessibilityLabel="Tutup"
                >
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>

                <View style={styles.segmentWrap}>
                  <Segmented
                    options={[
                      { value: 'task', label: 'Tugas' },
                      { value: 'schedule', label: 'Jadwal' },
                    ]}
                    value={kind}
                    onChange={setKind}
                  />
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.circleBtn,
                    !canSave && { opacity: 0.35 },
                    pressed && canSave && styles.pressed,
                  ]}
                  onPress={save}
                  disabled={!canSave}
                  accessibilityLabel="Simpan"
                >
                  <Ionicons name="checkmark" size={24} color={colors.text} />
                </Pressable>
              </View>

              {/* Judul + ringkasan waktu */}
              <View style={styles.titleBlock}>
                <View style={[styles.bar, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder={kind === 'task' ? 'Tugas baru' : 'Jadwal baru'}
                    placeholderTextColor={colors.textFaint}
                    style={styles.titleInput}
                    autoFocus={!editing}
                    returnKeyType="done"
                    onSubmitEditing={save}
                    selectionColor={colors.accent}
                    multiline={false}
                  />
                  <Pressable onPress={openSchedulePage} hitSlop={8}>
                    <Text style={styles.summary}>{summary}</Text>
                  </Pressable>
                </View>
              </View>

              <TextInput
                value={memo}
                onChangeText={setMemo}
                placeholder="Catatan"
                placeholderTextColor={colors.textFaint}
                style={styles.memo}
                multiline
                textAlignVertical="top"
                selectionColor={colors.accent}
              />

              {/* Goal (dropdown) */}
              <Pressable
                style={({ pressed }) => [styles.goalRow, pressed && styles.rowPressed]}
                onPress={openGoalMenu}
              >
                <Ionicons name="disc-outline" size={22} color={colors.text} />
                <Text style={styles.goalLabel}>Goal</Text>
                <View style={{ flex: 1 }} />
                <View ref={goalAnchor.ref} collapsable={false} style={styles.goalValueWrap}>
                  <Text style={styles.goalValue} numberOfLines={1}>
                    {goal ? goal.title : 'Tanpa goal'}
                  </Text>
                  <Ionicons name="chevron-expand" size={14} color={colors.textDim} />
                </View>
              </Pressable>

              {/* Baris chip bawah (semuanya dropdown, kecuali Tanggal) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chipsRow}
                style={styles.chipsScroll}
              >
                <Chip
                  icon="calendar-outline"
                  label={dateChipLabel}
                  active={kind === 'schedule' || useDate}
                  onPress={openSchedulePage}
                />
                <Chip
                  icon={priority === 0 ? 'flag-outline' : 'flag'}
                  iconColor={priority === 0 ? undefined : priorityMeta[priority].color}
                  label={priority === 0 ? 'Prioritas' : priorityMeta[priority].label}
                  active={priority !== 0}
                  onOpenMenu={openPriorityMenu}
                />
                <Chip
                  icon="pricetag-outline"
                  label={category ?? 'Kategori'}
                  active={category != null}
                  onOpenMenu={openCategoryMenu}
                />
                <ColorButton color={color} onOpenMenu={openColorMenu} />
                {editing && (
                  <Pressable
                    style={({ pressed }) => [styles.trashBtn, pressed && styles.pressed]}
                    onPress={confirmDelete}
                    accessibilityLabel="Hapus"
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </ScrollView>
            </>
          ) : (
            <View style={[styles.schedulePage, { height: schedulePageH }]}>
              {/* Navbar tetap di atas, tidak ikut bergerak saat mode berubah */}
              <View style={styles.pageHeader}>
                <Pressable
                  style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
                  onPress={() => goToPage('main')}
                  accessibilityLabel="Kembali"
                >
                  <Ionicons name="chevron-back" size={20} color={colors.text} />
                </Pressable>

                <View style={styles.pageTitleWrap} pointerEvents="none">
                  <Text style={styles.pageTitle}>Jadwal</Text>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.donePill, pressed && styles.pressed]}
                  onPress={() => goToPage('main')}
                >
                  <Text style={styles.doneText}>Selesai</Text>
                </Pressable>
              </View>

              <Seg3 value={mode} onChange={setMode} />

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scheduleContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {mode !== 'none' && (
                  <View style={styles.group}>
                    <Row icon="calendar-outline" label="Tanggal">
                      <NativePicker value={dateValue} mode="date" onChange={(d) => setDate(toKey(d))} />
                    </Row>

                    {mode === 'timed' && (
                      <>
                        <View style={styles.divider} />
                        <Row icon="remove-circle-outline" label="Tanpa jam selesai">
                          <Switch
                            value={noEnd}
                            onValueChange={(v) => {
                              tapSelect();
                              setNoEnd(v);
                            }}
                            trackColor={{ false: colors.surface2, true: colors.accent }}
                            thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
                            ios_backgroundColor={colors.surface2}
                          />
                        </Row>
                        <View style={styles.divider} />
                        <Row icon="time-outline" label="Waktu">
                          <NativePicker value={startValue} mode="time" onChange={onStartChange} />
                          {!noEnd && (
                            <>
                              <Text style={styles.dash}>—</Text>
                              <NativePicker value={endValue} mode="time" onChange={onEndChange} />
                            </>
                          )}
                        </Row>
                        {!noEnd && (
                          <Text style={styles.duration}>
                            {fmtDuration(Math.max(endMin - startMin, 0))}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                )}

                {mode !== 'none' && (
                  <View style={styles.group}>
                    <Row icon="repeat-outline" label="Ulangi">
                      <DropdownPill label={REPEATS[repeatIdx]} onOpen={openRepeatMenu} />
                    </Row>
                    <View style={styles.divider} />
                    <Row icon="notifications-outline" label="Pengingat">
                      <DropdownPill label={REMINDERS[reminderIdx]} onOpen={openReminderMenu} />
                    </Row>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </Animated.View>

        {/* Dropdown di level overlay (bukan di dalam sheet), supaya sentuhan jalan di iOS */}
        {menu && (
          <DropdownMenu
            menu={menu}
            winW={winW}
            winH={winH}
            insets={insets}
            onDismiss={() => setMenu(null)}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- Dropdown ---------- */

function DropdownMenu({
  menu,
  winW,
  winH,
  insets,
  onDismiss,
}: {
  menu: MenuConfig;
  winW: number;
  winH: number;
  insets: { top: number; bottom: number };
  onDismiss: () => void;
}) {
  const n = menu.items.length;
  const rows = Math.ceil(n / GRID_COLS);
  const menuW = menu.grid ? 256 : 240;
  const contentH = menu.grid ? rows * 40 + (rows - 1) * 8 + 24 : n * ITEM_H + 12;
  const menuH = Math.min(contentH, MENU_MAX_H);

  const rawLeft = menu.align === 'right' ? menu.anchor.x + menu.anchor.w - menuW : menu.anchor.x;
  const left = Math.min(Math.max(rawLeft, 12), winW - menuW - 12);

  const below = menu.anchor.y + menu.anchor.h + 6;
  const fitsBelow = below + menuH <= winH - insets.bottom - 8;
  const top = fitsBelow ? below : Math.max(menu.anchor.y - menuH - 6, insets.top + 8);

  // Muncul dengan fade + geser kecil dari arah anchor.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  // Kalau daftar panjang, gulirkan agar item terpilih terlihat.
  const scroller = useRef<Scrollable | null>(null);
  const setScroller = useCallback((s: Scrollable | null) => {
    scroller.current = s;
  }, []);
  const onScrollLayout = () => {
    if (menu.grid || contentH <= menuH) return;
    const y = Math.max(0, menu.selected * ITEM_H - menuH / 2 + ITEM_H);
    scroller.current?.scrollTo({ y, animated: false });
  };

  const pick = (i: number) => {
    tapSelect();
    menu.onSelect(i);
    onDismiss();
  };

  return (
    <>
      <Pressable style={styles.fill} onPress={onDismiss} accessibilityLabel="Tutup menu" />
      <Animated.View
        style={[
          styles.menu,
          {
            top,
            left,
            width: menuW,
            height: menuH,
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [fitsBelow ? -6 : 6, 0],
                }),
              },
            ],
          },
        ]}
      >
        <ScrollView
          ref={setScroller}
          onLayout={onScrollLayout}
          style={styles.menuScroll}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={menu.grid ? styles.menuGrid : styles.menuList}
        >
          {menu.items.map((it, i) => {
            const selected = i === menu.selected;
            if (menu.grid) {
              return (
                <Pressable
                  key={`${it.label}-${i}`}
                  onPress={() => pick(i)}
                  style={[styles.swatchOuter, selected && { borderColor: it.dot }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Warna ${it.label}`}
                >
                  <View style={[styles.swatch, { backgroundColor: it.dot }]} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={`${it.label}-${i}`}
                onPress={() => pick(i)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.menuItem,
                  selected && styles.menuItemSelected,
                  pressed && styles.menuItemPressed,
                ]}
              >
                {it.dot ? <View style={[styles.menuDot, { backgroundColor: it.dot }]} /> : null}
                <Text
                  style={[styles.menuText, selected && styles.menuTextActive]}
                  numberOfLines={1}
                >
                  {it.label}
                </Text>
                {selected && <Ionicons name="checkmark" size={18} color={colors.text} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </>
  );
}

/* ---------- Komponen kecil ---------- */

function Seg3({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const opts: { value: Mode; label: string }[] = [
    { value: 'none', label: 'Tanpa tanggal' },
    { value: 'date', label: 'Hanya tanggal' },
    { value: 'timed', label: 'Berwaktu' },
  ];
  return (
    <View style={styles.seg}>
      {opts.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segItem, active && styles.segItemActive]}
            onPress={() => {
              tapSelect();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[styles.segText, active && styles.segTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.textDim} />
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      <View style={styles.rowRight}>{children}</View>
    </View>
  );
}

function DropdownPill({ label, onOpen }: { label: string; onOpen: (a: Anchor) => void }) {
  const { ref, measure } = useMeasure();
  return (
    <Pressable
      ref={ref}
      collapsable={false}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      onPress={() => {
        tapSelect();
        measure(onOpen);
      }}
    >
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-expand" size={14} color={colors.textDim} />
    </Pressable>
  );
}

function ColorButton({ color, onOpenMenu }: { color: string; onOpenMenu: (a: Anchor) => void }) {
  const { ref, measure } = useMeasure();
  return (
    <Pressable
      ref={ref}
      collapsable={false}
      style={({ pressed }) => [styles.colorBtn, pressed && styles.pressed]}
      onPress={() => {
        tapSelect();
        measure(onOpenMenu);
      }}
      accessibilityLabel="Warna"
    >
      <View style={[styles.colorDot, { backgroundColor: color }]} />
    </Pressable>
  );
}

function Chip({
  icon,
  label,
  active,
  onPress,
  onOpenMenu,
  iconColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active: boolean;
  onPress?: () => void;
  onOpenMenu?: (a: Anchor) => void;
  iconColor?: string;
}) {
  const { ref, measure } = useMeasure();
  return (
    <Pressable
      ref={ref}
      collapsable={false}
      onPress={() => {
        tapSelect();
        if (onOpenMenu) measure(onOpenMenu);
        else onPress?.();
      }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={iconColor ?? (active ? colors.text : colors.textDim)} />
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {onOpenMenu && <Ionicons name="chevron-down" size={13} color={colors.textFaint} />}
    </Pressable>
  );
}

const CARD_BG = 'rgba(255,255,255,0.05)';

/** Pengganti StyleSheet.absoluteFillObject (sudah dihapus di React Native baru). */
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  fill: FILL,
  backdrop: { ...FILL, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    // Bayangan lembut di tepi atas sheet (iOS); Android pakai elevation.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  pressed: { opacity: 0.6 },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },

  // Halaman utama
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
  },
  segmentWrap: { flex: 1, maxWidth: 240 },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 22,
  },
  bar: { width: 4, borderRadius: 2 },
  titleInput: { color: colors.text, fontSize: 24, fontWeight: '700', paddingVertical: 4 },
  summary: { color: colors.textDim, fontSize: 15, marginTop: 4, paddingBottom: 2 },
  memo: {
    minHeight: 84,
    maxHeight: 140,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingTop: 0,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  goalLabel: { color: colors.text, fontSize: 16, fontWeight: '500' },
  goalValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalValue: { color: colors.textDim, fontSize: 15, maxWidth: 200 },
  chipsScroll: { flexGrow: 0 },
  chipsRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipActive: { backgroundColor: colors.surface2, borderColor: 'rgba(255,255,255,0.28)' },
  chipText: { color: colors.textDim, fontSize: 15, fontWeight: '500', maxWidth: 140 },
  chipTextActive: { color: colors.text },
  colorBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  colorDot: { width: 24, height: 24, borderRadius: 12 },
  trashBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBg,
  },

  // Dropdown (overlay)
  menu: {
    position: 'absolute',
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 24,
  },
  menuScroll: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  menuList: { padding: 6 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ITEM_H,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  menuItemSelected: { backgroundColor: 'rgba(255,255,255,0.05)' },
  menuItemPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  menuDot: { width: 12, height: 12, borderRadius: 6 },
  menuText: { flex: 1, color: colors.textDim, fontSize: 16 },
  menuTextActive: { color: colors.text, fontWeight: '600' },
  swatchOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: 28, height: 28, borderRadius: 14 },

  // Halaman jadwal
  schedulePage: { paddingHorizontal: 16 },
  pageHeader: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pageTitleWrap: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  donePill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  seg: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, borderRadius: 13 },
  segItemActive: { backgroundColor: colors.surface2 },
  segText: { color: colors.textDim, fontSize: 14, fontWeight: '500' },
  segTextActive: { color: colors.text, fontWeight: '600' },
  scheduleContent: { paddingBottom: 8 },
  group: { marginTop: 14, borderRadius: 18, backgroundColor: CARD_BG, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 52,
  },
  rowLabel: { color: colors.text, fontSize: 16, flexShrink: 0 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 46 },
  dash: { color: colors.textFaint, fontSize: 14 },
  duration: {
    alignSelf: 'flex-end',
    marginRight: 16,
    marginBottom: 10,
    color: colors.textFaint,
    fontSize: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pillText: { color: colors.text, fontSize: 15, maxWidth: 160 },
});
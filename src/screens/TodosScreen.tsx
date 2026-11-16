import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressRing } from '../components/ProgressRing';
import { Screen } from '../components/Screen';
import { TodoRow } from '../components/TodoRow';
import { useStore } from '../store';
import { card, colors } from '../theme';
import type { Goal, OpenSheet, Todo } from '../types';
import { fmtDayLong, toKey } from '../utils/date';
import { tapLight, tapSelect, tapSuccess, tapWarning } from '../utils/haptics';
import { useNow } from '../utils/useNow';

type Mode = 'todos' | 'goals';

function RowList({
  items,
  onToggle,
  onPress,
  onDelete,
}: {
  items: Todo[];
  onToggle: (id: string) => void;
  onPress: (t: Todo) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={card}>
      {items.map((t, i) => (
        <View key={t.id}>
          {i > 0 && <View style={styles.sep} />}
          <TodoRow todo={t} onToggle={onToggle} onPress={onPress} onDelete={onDelete} />
        </View>
      ))}
    </View>
  );
}

function Section({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Bar({ ratio, color }: { ratio: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(ratio, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [ratio, p]);
  const style = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, style]} />
    </View>
  );
}

function GoalsPanel({ year }: { year: number }) {
  const goals = useStore((s) => s.goals);
  const todos = useStore((s) => s.todos);
  const addGoal = useStore((s) => s.addGoal);
  const removeGoal = useStore((s) => s.removeGoal);
  const [text, setText] = useState('');

  const submit = () => {
    if (!text.trim()) return;
    addGoal(text);
    setText('');
    tapSuccess();
  };

  const confirmDelete = (g: Goal) => {
    tapWarning();
    Alert.alert('Hapus goal?', `"${g.title}" akan dihapus. Tugas yang terhubung tidak ikut terhapus.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => removeGoal(g.id) },
    ]);
  };

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      <Text style={styles.year}>{year}</Text>
      <Text style={styles.subtitle}>Sedikit demi sedikit, menuju hal yang penting tahun ini.</Text>

      <View style={[card, styles.goalInputCard]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Apa yang ingin kamu capai?"
          placeholderTextColor={colors.textFaint}
          style={styles.goalInput}
          returnKeyType="done"
          onSubmitEditing={submit}
          selectionColor={colors.accent}
        />
        <Pressable
          onPress={submit}
          disabled={!text.trim()}
          style={[styles.goalAdd, !text.trim() && { opacity: 0.35 }]}
          accessibilityLabel="Tambah goal"
        >
          <Ionicons name="add" size={22} color="#0E0E0F" />
        </Pressable>
      </View>

      {goals.length === 0 ? (
        <View style={[card, styles.empty]}>
          <Ionicons name="flag-outline" size={28} color={colors.textDim} />
          <Text style={styles.emptyTitle}>Mulai dari satu goal</Text>
          <Text style={styles.emptyBody}>
            Tulis satu tujuan tahunan, lalu hubungkan tugas ke goal itu saat membuatnya.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {goals.map((g) => {
            const linked = todos.filter((t) => t.goalId === g.id);
            const done = linked.filter((t) => t.done).length;
            const ratio = linked.length === 0 ? 0 : done / linked.length;
            return (
              <View key={g.id} style={[card, styles.goalCard]}>
                <View style={styles.goalTop}>
                  <View style={[styles.goalDot, { backgroundColor: g.color }]} />
                  <Text style={styles.goalTitle} numberOfLines={2}>
                    {g.title}
                  </Text>
                  <Pressable hitSlop={10} onPress={() => confirmDelete(g)} accessibilityLabel="Hapus goal">
                    <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                  </Pressable>
                </View>
                <Bar ratio={ratio} color={g.color} />
                <Text style={styles.goalMeta}>
                  {linked.length === 0
                    ? 'Belum ada tugas yang terhubung'
                    : `${done} dari ${linked.length} tugas selesai`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}

export function TodosScreen({ openSheet }: { openSheet: OpenSheet }) {
  const insets = useSafeAreaInsets();
  const now = useNow(60000);
  const today = toKey(now);

  const [mode, setMode] = useState<Mode>('todos');

  const todos = useStore((s) => s.todos);
  const toggleTodo = useStore((s) => s.toggleTodo);
  const removeTodo = useStore((s) => s.removeTodo);

  const { overdue, todayList, upcoming, noDate, done, doneToday, totalToday } = useMemo(() => {
    const tasks = todos.filter((t) => t.kind === 'task');
    const open = tasks.filter((t) => !t.done);
    const byDate = (a: Todo, b: Todo) => (a.date ?? '').localeCompare(b.date ?? '') || a.createdAt - b.createdAt;

    const todayRelevant = tasks.filter(
      (t) => t.date === today || (t.done && t.doneAt != null && toKey(new Date(t.doneAt)) === today),
    );

    return {
      overdue: open.filter((t) => t.date && t.date < today).sort(byDate),
      todayList: open.filter((t) => t.date === today).sort(byDate),
      upcoming: open.filter((t) => t.date && t.date > today).sort(byDate),
      noDate: open.filter((t) => !t.date).sort((a, b) => a.createdAt - b.createdAt),
      done: tasks
        .filter((t) => t.done)
        .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
        .slice(0, 15),
      doneToday: todayRelevant.filter((t) => t.done).length,
      totalToday: todayRelevant.length,
    };
  }, [todos, today]);

  const openCount = overdue.length + todayList.length + upcoming.length + noDate.length;
  const handlers = {
    onToggle: toggleTodo,
    onPress: (t: Todo) => openSheet({ editing: t }),
    onDelete: removeTodo,
  };

  return (
    <View style={styles.root}>
      <Screen>
        <View style={styles.header}>
          <View style={styles.tabs}>
            {(['todos', 'goals'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  if (m !== mode) {
                    tapSelect();
                    setMode(m);
                  }
                }}
              >
                <Text style={[styles.tab, m === mode && styles.tabActive]}>
                  {m === 'todos' ? 'To-do' : 'Goals'}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === 'todos' && <ProgressRing done={doneToday} total={totalToday} />}
        </View>

        {mode === 'todos' ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <Text style={styles.subtitle}>{fmtDayLong(today)}</Text>

            {openCount === 0 && done.length === 0 && (
              <View style={[card, styles.empty]}>
                <Ionicons name="checkmark-done-outline" size={30} color={colors.textDim} />
                <Text style={styles.emptyTitle}>Belum ada tugas</Text>
                <Text style={styles.emptyBody}>Ketuk tombol + untuk menambah tugas pertamamu.</Text>
              </View>
            )}

            {overdue.length > 0 && (
              <Section
                title="Belum selesai sebelumnya"
                count={overdue.length}
                hint="Tanggal asli tetap disimpan. Selesaikan atau jadwalkan ulang agar daftar ini bersih."
              >
                <RowList items={overdue} {...handlers} />
              </Section>
            )}
            {todayList.length > 0 && (
              <Section title="Hari ini" count={todayList.length}>
                <RowList items={todayList} {...handlers} />
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section title="Mendatang" count={upcoming.length}>
                <RowList items={upcoming} {...handlers} />
              </Section>
            )}
            {noDate.length > 0 && (
              <Section title="Tanpa tanggal" count={noDate.length}>
                <RowList items={noDate} {...handlers} />
              </Section>
            )}
            {done.length > 0 && (
              <Section title="Selesai" count={done.length}>
                <RowList items={done} {...handlers} />
              </Section>
            )}
          </Animated.View>
        ) : (
          <GoalsPanel year={now.getFullYear()} />
        )}
      </Screen>

      {mode === 'todos' && (
        <Pressable
          style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 66 + 16 }]}
          onPress={() => {
            tapLight();
            openSheet({ kind: 'task' });
          }}
          accessibilityLabel="Tambah tugas"
        >
          <Ionicons name="add" size={30} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabs: { flexDirection: 'row', alignItems: 'baseline', gap: 18 },
  tab: { color: colors.textFaint, fontSize: 32, fontWeight: '700' },
  tabActive: { color: colors.text },
  subtitle: { color: colors.textDim, fontSize: 15, marginTop: 4, marginBottom: 18 },
  year: { color: colors.text, fontSize: 40, fontWeight: '700', marginTop: 18 },
  section: { marginTop: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  sectionCount: { color: colors.textFaint, fontSize: 15, fontWeight: '500' },
  sectionHint: { color: colors.textDim, fontSize: 13, marginTop: 4, paddingHorizontal: 4 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 60 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 30, paddingHorizontal: 24, marginTop: 8 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 4 },
  emptyBody: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  goalInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 8,
    marginBottom: 16,
  },
  goalInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 },
  goalAdd: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
  },
  goalCard: { padding: 18, gap: 14 },
  goalTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalDot: { width: 14, height: 14, borderRadius: 7 },
  goalTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '600' },
  goalMeta: { color: colors.textDim, fontSize: 13 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
});

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ClockFace } from '../components/ClockFace';
import { Screen } from '../components/Screen';
import { TodoRow } from '../components/TodoRow';
import { useStore } from '../store';
import { card, colors, serif } from '../theme';
import type { OpenSheet, Todo } from '../types';
import {
  DAY_LETTER_MON_FIRST,
  MONTHS,
  addDays,
  fmtDayLong,
  fromKey,
  startOfWeek,
  toKey,
} from '../utils/date';
import { tapLight, tapSelect } from '../utils/haptics';
import { useNow } from '../utils/useNow';

const byTime = (a: Todo, b: Todo) => {
  if (a.kind !== b.kind) return a.kind === 'schedule' ? -1 : 1;
  if (a.kind === 'schedule') return (a.startMin ?? 0) - (b.startMin ?? 0);
  return a.createdAt - b.createdAt;
};

function WeekStrip({
  selected,
  today,
  marked,
  onSelect,
}: {
  selected: string;
  today: string;
  marked: Set<string>;
  onSelect: (key: string) => void;
}) {
  const [w, setW] = useState(0);
  const start = startOfWeek(fromKey(selected));
  const days = Array.from({ length: 7 }, (_, i) => toKey(addDays(start, i)));
  const index = days.indexOf(selected);
  const cellW = w / 7;

  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(index * cellW, { damping: 18, stiffness: 220, mass: 0.7 });
  }, [index, cellW, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={styles.week} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && <Animated.View style={[styles.weekThumb, { width: cellW - 6 }, thumb]} />}
      {days.map((k, i) => {
        const isSel = k === selected;
        const d = fromKey(k);
        return (
          <Pressable
            key={k}
            style={styles.weekCell}
            onPress={() => {
              tapSelect();
              onSelect(k);
            }}
            accessibilityLabel={fmtDayLong(k)}
          >
            <Text style={[styles.weekDow, isSel && styles.weekDark]}>{DAY_LETTER_MON_FIRST[i]}</Text>
            <Text
              style={[
                styles.weekNum,
                isSel && styles.weekDark,
                !isSel && k === today && { color: colors.accent },
              ]}
            >
              {d.getDate()}
            </Text>
            <View
              style={[
                styles.weekDot,
                marked.has(k) && { backgroundColor: isSel ? '#0E0E0F' : colors.textDim },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function TodayScreen({ openSheet }: { openSheet: OpenSheet }) {
  const now = useNow(60000);
  const today = toKey(now);
  const [selected, setSelected] = useState(today);

  const todos = useStore((s) => s.todos);
  const toggleTodo = useStore((s) => s.toggleTodo);
  const removeTodo = useStore((s) => s.removeTodo);
  const highContrast = useStore((s) => s.highContrast);

  const dayItems = useMemo(
    () => todos.filter((t) => t.date === selected).sort(byTime),
    [todos, selected],
  );
  const schedules = useMemo(() => dayItems.filter((t) => t.kind === 'schedule'), [dayItems]);
  const marked = useMemo(() => new Set(todos.map((t) => t.date).filter(Boolean) as string[]), [todos]);

  const sel = fromKey(selected);
  const shiftWeek = (n: number) => {
    tapLight();
    setSelected(toKey(addDays(sel, n * 7)));
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.brand}>Tempo</Text>
        <Pressable
          style={styles.plus}
          onPress={() => {
            tapLight();
            openSheet({ date: selected, kind: 'schedule' });
          }}
          accessibilityLabel="Tambah"
        >
          <Ionicons name="add" size={26} color={colors.text} />
        </Pressable>
      </View>

      <WeekStrip selected={selected} today={today} marked={marked} onSelect={setSelected} />

      <View style={styles.dateRow}>
        <View style={styles.monthNav}>
          <Pressable hitSlop={10} onPress={() => shiftWeek(-1)} accessibilityLabel="Minggu sebelumnya">
            <Ionicons name="chevron-back" size={18} color={colors.textDim} />
          </Pressable>
          <Text style={styles.monthText}>
            {MONTHS[sel.getMonth()]} {sel.getFullYear()}
          </Text>
          <Pressable hitSlop={10} onPress={() => shiftWeek(1)} accessibilityLabel="Minggu berikutnya">
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        </View>
        {selected !== today && (
          <Pressable style={styles.todayPill} onPress={() => setSelected(today)}>
            <Ionicons name="return-down-back" size={15} color={colors.text} />
            <Text style={styles.todayPillText}>Hari ini</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.clockWrap}>
        <ClockFace items={schedules} highContrast={highContrast} />
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{fmtDayLong(selected)}</Text>
        <Text style={styles.listCount}>{dayItems.length} item</Text>
      </View>

      {dayItems.length === 0 ? (
        <Pressable
          style={[card, styles.empty]}
          onPress={() => openSheet({ date: selected, kind: 'schedule' })}
        >
          <Ionicons name="add-circle-outline" size={28} color={colors.textDim} />
          <Text style={styles.emptyTitle}>Belum ada rencana</Text>
          <Text style={styles.emptyBody}>Ketuk di sini untuk menambah jadwal di hari ini.</Text>
        </Pressable>
      ) : (
        <View style={card}>
          {dayItems.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <View style={styles.sep} />}
              <TodoRow
                todo={t}
                onToggle={toggleTodo}
                onPress={(todo) => openSheet({ editing: todo })}
                onDelete={removeTodo}
              />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.text, fontSize: 30, fontFamily: serif, letterSpacing: 0.3 },
  plus: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  week: { flexDirection: 'row', marginTop: 20 },
  weekThumb: {
    position: 'absolute',
    left: 3,
    top: 0,
    bottom: 0,
    borderRadius: 22,
    backgroundColor: '#F5F5F7',
  },
  weekCell: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 5 },
  weekDow: { color: colors.textFaint, fontSize: 13, fontWeight: '500' },
  weekNum: { color: colors.textDim, fontSize: 19, fontWeight: '600' },
  weekDark: { color: '#0E0E0F' },
  weekDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    minHeight: 36,
  },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthText: { color: colors.textDim, fontSize: 15, fontWeight: '500' },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayPillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  clockWrap: { marginTop: 8, marginBottom: 18, alignItems: 'center' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  listTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  listCount: { color: colors.textFaint, fontSize: 14 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 60 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 28, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 4 },
  emptyBody: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
});

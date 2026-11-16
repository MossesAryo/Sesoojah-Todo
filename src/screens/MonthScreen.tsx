import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Screen } from '../components/Screen';
import { TodoRow } from '../components/TodoRow';
import { useStore } from '../store';
import { card, colors } from '../theme';
import type { OpenSheet, Todo } from '../types';
import { DAY_LETTER_MON_FIRST, MONTHS, fmtDayLong, pad, toKey } from '../utils/date';
import { tapLight, tapSelect } from '../utils/haptics';
import { useNow } from '../utils/useNow';

export function MonthScreen({ openSheet }: { openSheet: OpenSheet }) {
  const now = useNow(60000);
  const today = toKey(now);

  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(today);

  const todos = useStore((s) => s.todos);
  const toggleTodo = useStore((s) => s.toggleTodo);
  const removeTodo = useStore((s) => s.removeTodo);

  const byDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const t of todos) {
      if (!t.date) continue;
      const list = map.get(t.date);
      if (list) list.push(t);
      else map.set(t.date, [t]);
    }
    return map;
  }, [todos]);

  const weeks = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const lead = (first.getDay() + 6) % 7; // Senin = 0
    const total = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (number | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: total }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  const shiftMonth = (n: number) => {
    tapLight();
    setCursor((c) => {
      const d = new Date(c.y, c.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const dayItems = (byDate.get(selected) ?? [])
    .slice()
    .sort((a, b) => (a.startMin ?? 24 * 60) - (b.startMin ?? 24 * 60) || a.createdAt - b.createdAt);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{MONTHS[cursor.m]}</Text>
        <View style={styles.nav}>
          <Pressable style={styles.navBtn} onPress={() => shiftMonth(-1)} accessibilityLabel="Bulan sebelumnya">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => shiftMonth(1)} accessibilityLabel="Bulan berikutnya">
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.year}>{cursor.y}</Text>

      <View style={styles.dowRow}>
        {DAY_LETTER_MON_FIRST.map((d) => (
          <Text key={d} style={styles.dow}>
            {d}
          </Text>
        ))}
      </View>

      <Animated.View key={`${cursor.y}-${cursor.m}`} entering={FadeIn.duration(180)}>
        {weeks.map((row, ri) => (
          <View key={ri} style={styles.weekRow}>
            {row.map((day, ci) => {
              if (day == null) return <View key={ci} style={styles.cell} />;
              const key = `${cursor.y}-${pad(cursor.m + 1)}-${pad(day)}`;
              const isSel = key === selected;
              const isToday = key === today;
              const items = byDate.get(key) ?? [];
              return (
                <Pressable
                  key={ci}
                  style={styles.cell}
                  onPress={() => {
                    tapSelect();
                    setSelected(key);
                  }}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      isSel && styles.dayCircleSel,
                      !isSel && isToday && styles.dayCircleToday,
                    ]}
                  >
                    <Text style={[styles.dayNum, isSel && { color: '#0E0E0F' }]}>{day}</Text>
                  </View>
                  <View style={styles.dots}>
                    {items.slice(0, 3).map((t) => (
                      <View key={t.id} style={[styles.dot, { backgroundColor: t.color }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{fmtDayLong(selected)}</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            tapLight();
            openSheet({ date: selected, kind: 'schedule' });
          }}
        >
          <Ionicons name="add" size={18} color={colors.text} />
          <Text style={styles.addText}>Tambah</Text>
        </Pressable>
      </View>

      {dayItems.length === 0 ? (
        <View style={[card, styles.empty]}>
          <Text style={styles.emptyText}>Tidak ada rencana di tanggal ini.</Text>
        </View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 34, fontWeight: '700' },
  year: { color: colors.textFaint, fontSize: 16, fontWeight: '500', marginTop: 2, marginBottom: 18 },
  nav: { flexDirection: 'row', gap: 8 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dowRow: { flexDirection: 'row', marginBottom: 6 },
  dow: { flex: 1, textAlign: 'center', color: colors.textFaint, fontSize: 12, fontWeight: '500' },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1, height: 54, alignItems: 'center', paddingTop: 4 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleSel: { backgroundColor: '#F5F5F7' },
  dayCircleToday: { borderWidth: 1.5, borderColor: colors.accent },
  dayNum: { color: colors.text, fontSize: 16, fontWeight: '500' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 4, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  listTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 60 },
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { color: colors.textDim, fontSize: 15 },
});

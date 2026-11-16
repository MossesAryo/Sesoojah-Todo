import React, { memo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeOut,
  LinearTransition,
  type SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, priorityMeta } from '../theme';
import type { Todo } from '../types';
import { diffDays, fmtMin, relativeLabel, todayKey } from '../utils/date';
import { tapLight, tapWarning } from '../utils/haptics';

function Check({ done, color, onPress }: { done: boolean; color: string; onPress: () => void }) {
  const p = useSharedValue(done ? 1 : 0);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    p.value = withSpring(done ? 1 : 0, { damping: 15, stiffness: 220 });
    if (done) {
      scale.value = 0.82;
      scale.value = withSpring(1, { damping: 8, stiffness: 260 });
    }
  }, [done, p, scale]);

  const box = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(p.value, [0, 1], ['rgba(255,255,255,0)', '#F5F5F7']),
    borderColor: interpolateColor(p.value, [0, 1], [color, '#F5F5F7']),
  }));
  const tick = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: interpolate(p.value, [0, 1], [0.4, 1]) }],
  }));

  return (
    <Pressable onPress={onPress} hitSlop={12}>
      <Animated.View style={[styles.check, box]}>
        <Animated.View style={tick}>
          <Ionicons name="checkmark" size={17} color="#0E0E0F" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function DeleteAction({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1], 'clamp') }],
  }));
  return (
    <View style={styles.deleteWrap}>
      <Animated.View style={style}>
        <Ionicons name="trash-outline" size={22} color={colors.danger} />
      </Animated.View>
    </View>
  );
}

interface Props {
  todo: Todo;
  onToggle: (id: string) => void;
  onPress: (todo: Todo) => void;
  onDelete: (id: string) => void;
}

export const TodoRow = memo(function TodoRow({ todo, onToggle, onPress, onDelete }: Props) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const today = todayKey();

  const overdueDays =
    !todo.done && todo.kind === 'task' && todo.date && todo.date < today
      ? diffDays(today, todo.date)
      : 0;

  let meta = 'Tanpa tanggal';
  if (todo.kind === 'schedule' && todo.startMin != null && todo.endMin != null) {
    meta = `${fmtMin(todo.startMin)} – ${fmtMin(todo.endMin)}`;
  } else if (todo.date) {
    meta = relativeLabel(todo.date, today);
  }

  return (
    <Animated.View layout={LinearTransition.springify().damping(18)} exiting={FadeOut.duration(160)}>
      <Swipeable
        ref={swipeRef}
        friction={1.6}
        rightThreshold={64}
        overshootRight={false}
        renderRightActions={(progress) => <DeleteAction progress={progress} />}
        // Hanya ada panel aksi di kanan (hapus), jadi setiap "open" berarti hapus.
        onSwipeableOpen={() => {
          tapWarning();
          onDelete(todo.id);
        }}
      >
        <Pressable onPress={() => onPress(todo)} style={styles.row}>
          <Check
            done={todo.done}
            color={todo.color}
            onPress={() => {
              tapLight();
              onToggle(todo.id);
            }}
          />
          <View style={styles.body}>
            <Text
              numberOfLines={2}
              style={[styles.title, todo.done && styles.titleDone]}
            >
              {todo.title}
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.dot, { backgroundColor: todo.color }]} />
              <Text style={styles.meta}>{meta}</Text>
              {todo.category ? <Text style={styles.meta}>· {todo.category}</Text> : null}
            </View>
            {overdueDays > 0 && (
              <View style={styles.overdue}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={styles.overdueText}>Terlambat · {overdueDays} hr</Text>
              </View>
            )}
          </View>
          {todo.priority > 0 && !todo.done && (
            <Ionicons name="flag" size={16} color={priorityMeta[todo.priority].color} />
          )}
        </Pressable>
      </Swipeable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 17, fontWeight: '500' },
  titleDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { color: colors.textDim, fontSize: 13 },
  overdue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.dangerBg,
  },
  overdueText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  deleteWrap: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBg,
  },
});

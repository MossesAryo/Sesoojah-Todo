import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors } from '../theme';
import { tapSelect } from '../utils/haptics';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Lebar total; default mengisi parent. */
  width?: number;
}

export function Segmented<T extends string>({ options, value, onChange, width }: Props<T>) {
  const [w, setW] = useState(width ?? 0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const segW = w > 0 ? (w - 8) / options.length : 0;

  useEffect(() => {
    x.value = withSpring(index * segW, { damping: 20, stiffness: 240, mass: 0.7 });
  }, [index, segW, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={[styles.track, width ? { width } : null]}
      onLayout={(e) => !width && setW(e.nativeEvent.layout.width)}
    >
      {segW > 0 && <Animated.View style={[styles.thumb, { width: segW }, thumb]} />}
      {options.map((o) => (
        <Pressable
          key={o.value}
          style={styles.item}
          onPress={() => {
            if (o.value !== value) {
              tapSelect();
              onChange(o.value);
            }
          }}
        >
          <Text style={[styles.label, o.value === value && styles.labelActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 999,
    backgroundColor: colors.surface2,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9 },
  label: { fontSize: 15, fontWeight: '500', color: colors.textFaint },
  labelActive: { color: colors.text, fontWeight: '600' },
});

import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme';
import { fmtMin, fmtShort, minOfDate, toKey } from '../utils/date';

interface Props {
  value: Date;
  mode: 'date' | 'time';
  onChange: (date: Date) => void;
}

/**
 * iOS: picker native gaya "compact" (pill yang membuka popover).
 * Android: tombol yang membuka dialog sistem.
 */
export function NativePicker({ value, mode, onChange }: Props) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        themeVariant="dark"
        accentColor={colors.accent}
        locale="id-ID"
        onChange={(_, d) => d && onChange(d)}
      />
    );
  }

  const label = mode === 'date' ? fmtShort(toKey(value)) : fmtMin(minOfDate(value));
  return (
    <>
      <Pressable style={styles.btn} onPress={() => setOpen(true)}>
        <Text style={styles.text}>{label}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value}
          mode={mode}
          is24Hour
          onChange={(e, d) => {
            setOpen(false);
            if (e.type === 'set' && d) onChange(d);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface2,
  },
  text: { color: colors.text, fontSize: 15, fontWeight: '500' },
});

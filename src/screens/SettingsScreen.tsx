import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { useStore } from '../store';
import { card, colors } from '../theme';
import { tapWarning } from '../utils/haptics';

export function SettingsScreen() {
  const highContrast = useStore((s) => s.highContrast);
  const setHighContrast = useStore((s) => s.setHighContrast);
  const todos = useStore((s) => s.todos);
  const clearDone = useStore((s) => s.clearDone);
  const resetAll = useStore((s) => s.resetAll);

  const doneCount = todos.filter((t) => t.done).length;

  const confirmClearDone = () => {
    if (doneCount === 0) return;
    tapWarning();
    Alert.alert('Hapus yang sudah selesai?', `${doneCount} item akan dihapus.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: clearDone },
    ]);
  };

  const confirmReset = () => {
    tapWarning();
    Alert.alert('Hapus semua data?', 'Semua tugas, jadwal, dan goal akan dihapus dari perangkat ini dan cloud.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus semua', style: 'destructive', onPress: resetAll },
    ]);
  };

  return (
    <Screen>
      <Text style={styles.title}>Pengaturan</Text>

      <View style={[card, styles.block]}>
        <Text style={styles.label}>Lebar blok jam</Text>
        <Text style={styles.help}>
          Kontras tinggi membuat jadwal yang lebih lama tampil lebih tebal di jam. Waktu mulai dan
          selesai tetap akurat.
        </Text>
        <Segmented
          options={[
            { value: 'standard', label: 'Standar' },
            { value: 'high', label: 'Kontras tinggi' },
          ]}
          value={highContrast ? 'high' : 'standard'}
          onChange={(v) => setHighContrast(v === 'high')}
        />
      </View>

      <View style={[card, styles.block, { paddingVertical: 6 }]}>
        <Pressable
          style={[styles.action, doneCount === 0 && { opacity: 0.4 }]}
          onPress={confirmClearDone}
          disabled={doneCount === 0}
        >
          <Ionicons name="checkmark-done-outline" size={20} color={colors.text} />
          <Text style={styles.actionText}>Hapus yang sudah selesai</Text>
          <Text style={styles.actionCount}>{doneCount}</Text>
        </Pressable>
        <View style={styles.sep} />
        <Pressable style={styles.action} onPress={confirmReset}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
          <Text style={[styles.actionText, { color: colors.danger }]}>Hapus semua data</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>Tempo 1.0</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 34, fontWeight: '700', marginBottom: 20 },
  block: { padding: 18, gap: 12, marginBottom: 16 },
  label: { color: colors.text, fontSize: 17, fontWeight: '600' },
  help: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  actionText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
  actionCount: { color: colors.textFaint, fontSize: 15 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  footer: { color: colors.textFaint, fontSize: 13, textAlign: 'center', marginTop: 8 },
});

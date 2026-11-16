import React, { useCallback, useEffect, useState } from 'react';
import { LogBox, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Abaikan warning timer panjang bawaan koneksi Firestore di React Native
LogBox.ignoreLogs(['Setting a timer']);
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AddSheet } from './src/components/AddSheet';
import { FloatingTabBar } from './src/components/FloatingTabBar';
import { MonthScreen } from './src/screens/MonthScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { TodosScreen } from './src/screens/TodosScreen';
import { useHydrated } from './src/store';
import { initFirebase } from './src/firestore';
import { colors } from './src/theme';
import type { SheetOptions, TabKey } from './src/types';

export default function App() {
  const ready = useHydrated();
  const [tab, setTab] = useState<TabKey>('today');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<SheetOptions>({});

  // Inisialisasi sinkronisasi Firebase setelah store lokal ter-hydrate
  useEffect(() => {
    if (!ready) return;
    const cleanup = initFirebase();
    return cleanup;
  }, [ready]);

  const openSheet = useCallback((options?: SheetOptions) => {
    setSheetOptions(options ?? {});
    setSheetVisible(true);
  }, []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {ready && (
          <Animated.View key={tab} entering={FadeIn.duration(220)} style={styles.root}>
            {tab === 'today' && <TodayScreen openSheet={openSheet} />}
            {tab === 'month' && <MonthScreen openSheet={openSheet} />}
            {tab === 'todos' && <TodosScreen openSheet={openSheet} />}
            {tab === 'settings' && <SettingsScreen />}
          </Animated.View>
        )}
        <FloatingTabBar active={tab} onChange={setTab} />
        <AddSheet visible={sheetVisible} options={sheetOptions} onClose={closeSheet} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});

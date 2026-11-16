import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import type { TabKey } from '../types';
import { tapSelect } from '../utils/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { key: TabKey; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'today', label: 'Hari ini', icon: 'time-outline', iconActive: 'time' },
  { key: 'month', label: 'Bulan', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'todos', label: 'To-do', icon: 'layers-outline', iconActive: 'layers' },
  { key: 'settings', label: 'Atur', icon: 'settings-outline', iconActive: 'settings' },
];

interface Props {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

function TabItem({
  tab,
  focused,
  onPress,
}: {
  tab: (typeof TABS)[number];
  focused: boolean;
  onPress: () => void;
}) {
  const p = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    p.value = withSpring(focused ? 1 : 0, { damping: 16, stiffness: 200, mass: 0.8 });
  }, [focused, p]);

  const bg = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.88 + 0.12 * p.value }],
  }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.1 * p.value }] }));

  return (
    <Pressable
      onPress={onPress}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[styles.itemBg, bg]} />
      <Animated.View style={icon}>
        <Ionicons
          name={focused ? tab.iconActive : tab.icon}
          size={24}
          color={focused ? colors.text : colors.textDim}
        />
      </Animated.View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

export function FloatingTabBar({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}
    >
      <View style={styles.shadow}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 50 : 80}
          tint="systemChromeMaterialDark"
          style={styles.bar}
        >
          <View style={styles.tint} pointerEvents="none" />
          {TABS.map((t) => (
            <TabItem
              key={t.key}
              tab={t}
              focused={t.key === active}
              onPress={() => {
                if (t.key !== active) {
                  tapSelect();
                  onChange(t.key);
                }
              }}
            />
          ))}
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20 },
  shadow: {
    borderRadius: 34,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  bar: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(24,24,26,0.72)' },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    gap: 3,
  },
  itemBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  label: { fontSize: 11, fontWeight: '500', color: colors.textDim },
  labelActive: { color: colors.text, fontWeight: '600' },
});

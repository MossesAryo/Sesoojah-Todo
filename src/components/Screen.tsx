import React, { type ReactNode } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, TAB_BAR_SPACE } from '../theme';

interface Props {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Scroll container standar: menghormati safe area & memberi ruang untuk tab bar mengambang. */
export function Screen({ children, contentStyle }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      alwaysBounceVertical
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + TAB_BAR_SPACE + 24,
          paddingHorizontal: 20,
        },
        contentStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});

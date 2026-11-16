import * as Haptics from 'expo-haptics';

const safe = (fn: () => Promise<void>) => {
  fn().catch(() => {});
};

export const tapLight = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const tapSelect = () => safe(() => Haptics.selectionAsync());
export const tapSuccess = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const tapWarning = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

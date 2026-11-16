import { Platform } from 'react-native';

export const colors = {
  bg: '#0E0E0F',
  surface: '#1A1A1C',
  surface2: '#252528',
  border: 'rgba(255,255,255,0.08)',
  text: '#F5F5F7',
  textDim: 'rgba(245,245,247,0.62)',
  textFaint: 'rgba(245,245,247,0.36)',
  accent: '#E8967A',
  danger: '#FF6B5E',
  dangerBg: 'rgba(255,107,94,0.14)',
  success: '#8FD694',
};

/** Warna blok jadwal / tugas (pastel, kontras baik di atas latar gelap). */
export const palette = [
  '#F4E6A0', // kuning
  '#BDE5B8', // hijau
  '#D5C8F0', // lavender
  '#F5C5B0', // peach
  '#B8D6F5', // biru
  '#F2B8CC', // pink
];

export const categories = ['Sekolah', 'Belajar', 'Kerja', 'Pribadi'];

export const priorityMeta = [
  { label: 'Prioritas', color: colors.textDim },
  { label: 'Rendah', color: '#8FD694' },
  { label: 'Sedang', color: '#F4E6A0' },
  { label: 'Tinggi', color: '#FF8A7A' },
] as const;

/** Font wordmark: Georgia Italic tersedia bawaan di iOS. */
export const serif = Platform.select({ ios: 'Georgia-Italic', default: 'serif' });

export const card = {
  backgroundColor: colors.surface,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: colors.border,
  overflow: 'hidden' as const,
};

/** Tinggi area yang ditutup tab bar mengambang (di luar safe area bawah). */
export const TAB_BAR_SPACE = 104;

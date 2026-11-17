# Sesoojah-Todo

Aplikasi to-do & jadwal berbasis jam, dibuat dengan Expo (SDK 58) + React Native Reanimated 4, diprioritaskan untuk iOS.

## Menjalankan

```bash
npm install
npx expo start
```

Scan QR dengan Expo Go di iPhone. Untuk build native: `npx expo run:ios` (butuh Xcode di Mac).

## Struktur

- `App.tsx`: root, tab, sheet tambah/edit
- `src/store.ts`: state (Zustand) + penyimpanan AsyncStorage
- `src/components/ClockFace.tsx`: jam 2 cincin (AM dalam, PM luar), jarum di UI thread
- `src/components/TodoRow.tsx`: baris dengan checkbox animasi + swipe kiri untuk hapus
- `src/components/AddSheet.tsx`: sheet native iOS (pageSheet) untuk tugas/jadwal
- `src/screens/*`: Hari ini, Bulan, To-do & Goals, Pengaturan

## Pull Request
Feel Free to contribute, please use semantic message on PR. Example:
  - feat: feature



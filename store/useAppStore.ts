import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppState {
  name: string;
  isCalibrated: boolean;
  streak: number;
  lastHoldDate: string | null;
  setName: (name: string) => void;
  setCalibrated: (val: boolean) => void;
  incrementStreak: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      name: '',
      isCalibrated: false,
      streak: 0,
      lastHoldDate: null,
      setName: (name) => set({ name }),
      setCalibrated: (val) => set({ isCalibrated: val }),
      incrementStreak: () => set((state) => ({ streak: state.streak + 1 })),
    }),
    {
      name: 'dead-weight-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
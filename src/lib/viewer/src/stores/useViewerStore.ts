import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewerStore } from '../types/hooks';

export const useViewerStore = create<ViewerStore>()(
  persist(
    (set) => ({
      // 主题
      theme: 'light',
      setTheme: (theme) => set({ theme }),

      // 布局偏好
      siderWidth: 200,
      setSiderWidth: (width) => set({ siderWidth: width }),
      siderCollapsed: false,
      setSiderCollapsed: (collapsed) => set({ siderCollapsed: collapsed }),

      markPanelWidth: 350,
      setMarkPanelWidth: (width) => set({ markPanelWidth: width }),
      markPanelCollapsed: false,
      setMarkPanelCollapsed: (collapsed) => set({ markPanelCollapsed: collapsed }),

      // 用户偏好
      preferences: {
        autoSaveInterval: 300,
        showLineNumbers: true,
        enableHotReload: true,
        defaultViewMode: 'preview',
      },
      updatePreferences: (newPreferences) =>
        set((state) => ({
          preferences: { ...state.preferences, ...newPreferences },
        })),
    }),
    {
      name: 'prdkit-viewer-storage', // localStorage key
      partialize: (state) => ({
        // 只持久化这些字段
        theme: state.theme,
        siderWidth: state.siderWidth,
        siderCollapsed: state.siderCollapsed,
        markPanelWidth: state.markPanelWidth,
        markPanelCollapsed: state.markPanelCollapsed,
        preferences: state.preferences,
      }),
    }
  )
);

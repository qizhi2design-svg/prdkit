import { createContext, useContext } from 'react';
import type { ViewerSkillConfig } from '../types';

export interface AppConfig {
  projectName: string;
  prototypesDir: string;
  viewerSkills: ViewerSkillConfig;
}

const AppConfigContext = createContext<AppConfig | null>(null);

export function useAppConfig(): AppConfig {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfig must be used within AppConfigProvider');
  }
  return context;
}

export const AppConfigProvider = AppConfigContext.Provider;

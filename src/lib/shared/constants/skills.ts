import { DEFAULT_COPY_TERMINAL_GUIDE } from './messages.js';

export const DEFAULT_PAGE_CREATE_SKILL_COMMAND = '/prdkit-page-create';
export const DEFAULT_INSPECT_COPY_SKILL_COMMAND = '/prdkit-page-update';
export const DEFAULT_MARK_CREATE_SKILL_COMMAND = '/prdkit-mark-create';
export const DEFAULT_MARK_UPDATE_SKILL_COMMAND = '/prdkit-mark-update';

export const DEFAULT_VIEWER_SKILLS = {
  pageCreateSkillCommand: DEFAULT_PAGE_CREATE_SKILL_COMMAND,
  inspectCopySkillCommand: DEFAULT_INSPECT_COPY_SKILL_COMMAND,
  markCreateSkillCommand: DEFAULT_MARK_CREATE_SKILL_COMMAND,
  markUpdateSkillCommand: DEFAULT_MARK_UPDATE_SKILL_COMMAND,
  copyTerminalGuide: DEFAULT_COPY_TERMINAL_GUIDE,
} as const;

import { message } from 'antd';
import { DEFAULT_COPY_TERMINAL_GUIDE, DEFAULT_INSPECT_COPY_SKILL_COMMAND } from '../constants/clipboard';

export interface SkillClipboardTemplate {
  skillCommand?: string;
  payload: string;
}

export interface SkillClipboardNotice {
  successPrefix?: string;
  terminalGuide?: string;
}

export function buildSkillClipboardText({
  skillCommand = DEFAULT_INSPECT_COPY_SKILL_COMMAND,
  payload,
}: SkillClipboardTemplate): string {
  const normalizedPayload = payload.trim();

  if (!normalizedPayload) {
    return skillCommand.trim();
  }

  return `${skillCommand.trim()}\n\n${normalizedPayload}\n`;
}

export async function copySkillClipboardText(
  template: SkillClipboardTemplate,
  notice: SkillClipboardNotice = {}
): Promise<void> {
  const text = buildSkillClipboardText(template);
  await navigator.clipboard.writeText(text);

  const successPrefix = notice.successPrefix || '已复制 skill 指令';
  const terminalGuide = notice.terminalGuide || DEFAULT_COPY_TERMINAL_GUIDE;
  message.success(`${successPrefix}，${terminalGuide}`);
}

/**
 * 平台检测工具函数
 */

/**
 * 检测当前操作系统是否为 Mac
 */
export function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/**
 * 获取修饰键符号（Mac: ⌘, Windows/Linux: Ctrl）
 */
export function getModifierKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

/**
 * 获取修饰键文本（Mac: Cmd, Windows/Linux: Ctrl）
 */
export function getModifierKeyText(): string {
  return isMac() ? 'Cmd' : 'Ctrl';
}

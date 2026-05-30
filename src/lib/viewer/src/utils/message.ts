import type { MessageInstance } from 'antd/es/message/interface';

type MessageLevel = 'success' | 'error' | 'info' | 'warning' | 'open';
type PendingCall = {
  level: MessageLevel;
  args: unknown[];
};

let messageApi: MessageInstance | null = null;
const pendingCalls: PendingCall[] = [];

function flushPendingCalls() {
  if (!messageApi || pendingCalls.length === 0) return;

  const calls = pendingCalls.splice(0, pendingCalls.length);
  calls.forEach(({ level, args }) => {
    const fn = messageApi?.[level];
    if (typeof fn === 'function') {
      (fn as (...rest: unknown[]) => void)(...args);
    }
  });
}

export function setMessageApi(api: MessageInstance) {
  messageApi = api;
  flushPendingCalls();
}

function invoke(level: MessageLevel, args: unknown[]) {
  const fn = messageApi?.[level];
  if (typeof fn === 'function') {
    (fn as (...rest: unknown[]) => void)(...args);
    return;
  }

  pendingCalls.push({ level, args });
}

export const message = {
  success: (...args: unknown[]) => invoke('success', args),
  error: (...args: unknown[]) => invoke('error', args),
  info: (...args: unknown[]) => invoke('info', args),
  warning: (...args: unknown[]) => invoke('warning', args),
  open: (...args: unknown[]) => invoke('open', args),
};

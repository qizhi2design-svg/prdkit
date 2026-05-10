import { useState, useRef, useEffect, useCallback } from 'react';
import type { WebSocketOptions, WebSocketReturn } from '../../types/hooks';

export function useWebSocket(options: WebSocketOptions): WebSocketReturn {
  const { url, onMessage, reconnect = true, maxReconnectAttempts = Infinity } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const onMessageRef = useRef(onMessage);

  // 保持 onMessageRef 始终指向最新的 onMessage 回调
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket 已连接');
      setConnected(true);
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        onMessageRef.current?.(message);
      } catch (error) {
        console.error('解析 WebSocket 消息失败:', error);
      }
    };

    ws.onerror = () => {
      // onerror 之后通常会进入 onclose，这里不重复输出噪音日志
    };

    ws.onclose = () => {
      // 先检查是否已卸载
      if (unmountedRef.current) {
        return;
      }

      setConnected(false);
      wsRef.current = null;

      if (reconnect && reconnectAttemptRef.current < maxReconnectAttempts) {
        // 指数退避重连策略
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          // 再次检查，防止延迟期间组件卸载
          if (!unmountedRef.current) {
            connect();
          }
        }, delay);
      }
    };
  }, [url, reconnect, maxReconnectAttempts]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        // 只关闭已连接成功的 WebSocket，避免在 CONNECTING 状态关闭触发浏览器警告
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const close = useCallback(() => {
    unmountedRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  return {
    connected,
    send,
    close,
  };
}

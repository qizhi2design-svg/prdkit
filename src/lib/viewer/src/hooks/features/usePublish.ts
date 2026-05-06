import { useState, useCallback } from 'react';
import { message } from 'antd';
import type { UsePublishReturn, PublishParams } from '../../types/hooks';

export function usePublish(): UsePublishReturn {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [defaultPath, setDefaultPath] = useState('');

  // 打开发布抽屉
  const open = useCallback(async () => {
    setDrawerOpen(true);
    setLoading(true);

    try {
      const response = await fetch(`/api/publish/options?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '读取发布配置失败');
      }

      setDefaultPath(data.suggestedOutputPath || '');
    } catch (error) {
      console.error('读取发布配置失败:', error);
      message.error(error instanceof Error ? error.message : '读取发布配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 关闭发布抽屉
  const close = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  // 提交发布
  const submit = useCallback(async (params: PublishParams) => {
    const { outputPath, entryFiles, openAfterPublish } = params;
    setSubmitting(true);

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputPath,
          entryFiles,
          projectName: new URLSearchParams(window.location.search).get('projectname') || 'PRDKit',
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '发布失败');
      }

      if (openAfterPublish) {
        const openResponse = await fetch('/api/system/open-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath: data.outputDir }),
        });

        if (!openResponse.ok) {
          const openData = await openResponse.json().catch(() => null);
          throw new Error(openData?.message || openData?.error || '发布成功，但打开输出目录失败');
        }
      }

      message.success(`发布完成：${data.outputDir}`);
      setDrawerOpen(false);
    } catch (error) {
      console.error('发布失败:', error);
      message.error(error instanceof Error ? error.message : '发布失败');
    } finally {
      setSubmitting(false);
    }
  }, []);

  // 选择输出目录
  const pickDirectory = useCallback(async (currentPath: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/system/select-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPath: currentPath || defaultPath }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '打开目录选择器失败');
      }

      if (data.canceled || !data.path) {
        return null;
      }

      // 提取路径的最后一段作为目录名
      const extractPathBasename = (targetPath: string): string => {
        const normalized = targetPath.replace(/[\\/]+$/, '');
        const segments = normalized.split(/[\\/]/).filter(Boolean);
        return segments[segments.length - 1] || normalized;
      };

      // 拼接路径
      const joinPathSegments = (directoryPath: string, entryName: string): string => {
        const separator = directoryPath.includes('\\') ? '\\' : '/';
        const trimmedPath = directoryPath.replace(/[\\/]+$/, '');
        return `${trimmedPath}${separator}${entryName}`;
      };

      const currentName = extractPathBasename(currentPath || defaultPath || 'prototype-artifact');
      return joinPathSegments(data.path, currentName);
    } catch (error) {
      console.error('打开目录选择器失败:', error);
      message.error(error instanceof Error ? error.message : '打开目录选择器失败');
      return null;
    }
  }, [defaultPath]);

  return {
    drawerOpen,
    loading,
    submitting,
    defaultPath,
    open,
    close,
    submit,
    pickDirectory,
  };
}

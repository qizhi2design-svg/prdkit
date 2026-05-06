import { useState, useCallback, useMemo } from 'react';
import type { UseFileNavigationOptions, UseFileNavigationReturn } from '../../types/hooks';

export function useFileNavigation(options: UseFileNavigationOptions): UseFileNavigationReturn {
  const { projectName } = options;

  // 从 URL query 参数读取初始文件路径
  const getInitialFile = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('p');
  };

  const [selectedFile, setSelectedFile] = useState<string | null>(getInitialFile);
  const [fileList, setFileList] = useState<string[]>([]);
  const [prototypeRefreshVersion, setPrototypeRefreshVersion] = useState(0);

  // 计算当前文件索引
  const currentIndex = useMemo(() => {
    if (!selectedFile) return 0;
    const index = fileList.indexOf(selectedFile);
    return index >= 0 ? index + 1 : 0;
  }, [selectedFile, fileList]);

  // 选择文件
  const selectFile = useCallback(
    (path: string | null) => {
      setSelectedFile(path);

      const url = new URL(window.location.href);
      if (path) {
        url.searchParams.set('p', path);
        url.searchParams.set('projectname', projectName);
      } else {
        url.searchParams.delete('p');
        url.searchParams.delete('projectname');
      }
      window.history.pushState({}, '', url);
    },
    [projectName]
  );

  // 导航到上一个文件
  const navigatePrev = useCallback(() => {
    if (fileList.length === 0) return;

    const currentIdx = selectedFile ? fileList.indexOf(selectedFile) : -1;
    const newIndex = currentIdx <= 0 ? fileList.length - 1 : currentIdx - 1;
    selectFile(fileList[newIndex]);
  }, [fileList, selectedFile, selectFile]);

  // 导航到下一个文件
  const navigateNext = useCallback(() => {
    if (fileList.length === 0) return;

    const currentIdx = selectedFile ? fileList.indexOf(selectedFile) : -1;
    const newIndex = currentIdx >= fileList.length - 1 ? 0 : currentIdx + 1;
    selectFile(fileList[newIndex]);
  }, [fileList, selectedFile, selectFile]);

  // 更新文件列表
  const updateFileList = useCallback((files: string[]) => {
    setFileList(files);
  }, []);

  // 刷新原型列表
  const refreshPrototypes = useCallback(() => {
    setPrototypeRefreshVersion((prev) => prev + 1);
  }, []);

  return {
    selectedFile,
    fileList,
    currentIndex,
    selectFile,
    navigatePrev,
    navigateNext,
    updateFileList,
    refreshPrototypes,
    prototypeRefreshVersion,
  };
}

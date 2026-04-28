import { useState } from 'react';
import { Drawer, Tree, Input, Button, Space, message, Progress } from 'antd';
import { FolderOutlined, FileOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { PrototypeNode } from '../types';

interface PublishDrawerProps {
  open: boolean;
  onClose: () => void;
  prototypes: PrototypeNode[];
}

export default function PublishDrawer({ open, onClose, prototypes }: PublishDrawerProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [outputPath, setOutputPath] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectingFolder, setSelectingFolder] = useState(false);

  // 选择输出文件夹
  const handleSelectFolder = async () => {
    try {
      setSelectingFolder(true);
      const response = await fetch('/api/select-directory', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('选择文件夹失败');
      }

      const result = await response.json();
      if (result.path) {
        // 自动添加文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const fileName = `prototypes-${timestamp}.zip`;
        const fullPath = `${result.path}/${fileName}`;
        setOutputPath(fullPath);
      }
    } catch (error) {
      console.error('选择文件夹失败:', error);
      message.error('选择文件夹失败');
    } finally {
      setSelectingFolder(false);
    }
  };

  // 转换原型树为 Ant Design Tree 数据格式
  const convertToTreeData = (nodes: PrototypeNode[]): DataNode[] => {
    return nodes.map(node => ({
      title: node.name,
      key: node.path,
      icon: node.type === 'directory' ? <FolderOutlined /> : <FileOutlined />,
      children: node.children ? convertToTreeData(node.children) : undefined,
      isLeaf: node.type === 'file',
      checkable: node.type === 'directory', // 只允许选择目录
    }));
  };

  const treeData = convertToTreeData(prototypes);

  const handlePublish = async () => {
    if (selectedKeys.length === 0) {
      message.warning('请选择要发布的原型');
      return;
    }

    if (!outputPath) {
      message.warning('请输入输出路径');
      return;
    }

    try {
      setPublishing(true);
      setProgress(0);

      // 模拟进度更新
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prototypes: selectedKeys,
          outputPath,
        }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '发布失败');
      }

      const result = await response.json();
      message.success(`发布成功！文件已保存到: ${result.outputPath}`);

      // 重置状态
      setTimeout(() => {
        setSelectedKeys([]);
        setOutputPath('');
        setProgress(0);
        setPublishing(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('发布失败:', error);
      message.error(error instanceof Error ? error.message : '发布失败');
      setPublishing(false);
      setProgress(0);
    }
  };

  const handleClose = () => {
    if (!publishing) {
      onClose();
    }
  };

  return (
    <Drawer
      title="发布原型"
      placement="right"
      width={480}
      open={open}
      onClose={handleClose}
      maskClosable={!publishing}
      closable={!publishing}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择要发布的原型</div>
          <Tree
            checkable
            showIcon
            treeData={treeData}
            checkedKeys={selectedKeys}
            onCheck={(checked) => {
              setSelectedKeys(checked as string[]);
            }}
            style={{
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              padding: 8,
              maxHeight: 300,
              overflow: 'auto',
            }}
          />
        </div>

        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>输出路径</div>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="点击右侧按钮选择输出文件夹"
              value={outputPath}
              readOnly
              disabled={publishing}
            />
            <Button
              onClick={handleSelectFolder}
              loading={selectingFolder}
              disabled={publishing}
            >
              选择文件夹
            </Button>
          </Space.Compact>
          {outputPath && (
            <div style={{ marginTop: 4, fontSize: 12, color: '#52c41a' }}>
              ✓ 已选择输出路径
            </div>
          )}
        </div>

        {publishing && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>发布进度</div>
            <Progress percent={progress} status={progress === 100 ? 'success' : 'active'} />
          </div>
        )}

        <Button
          type="primary"
          block
          size="large"
          onClick={handlePublish}
          loading={publishing}
          disabled={selectedKeys.length === 0 || !outputPath}
        >
          {publishing ? '发布中...' : '开始发布'}
        </Button>
      </Space>
    </Drawer>
  );
}

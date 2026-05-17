import { Drawer, Form, Switch, InputNumber, Radio } from 'antd';
import { useViewerStore } from '../stores/useViewerStore';

interface PreferencesDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function PreferencesDrawer({ open, onClose }: PreferencesDrawerProps) {
  const preferences = useViewerStore((state) => state.preferences);
  const updatePreferences = useViewerStore((state) => state.updatePreferences);
  const theme = useViewerStore((state) => state.theme);
  const setTheme = useViewerStore((state) => state.setTheme);

  return (
    <Drawer title="用户偏好设置" open={open} onClose={onClose} placement="right" width={400}>
      <Form layout="vertical">
        <Form.Item label="主题">
          <Radio.Group value={theme} onChange={(e) => setTheme(e.target.value)}>
            <Radio.Button value="light">浅色</Radio.Button>
            <Radio.Button value="dark">深色</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label="自动保存间隔（秒）"
          help="设置自动保存版本的时间间隔"
        >
          <InputNumber
            min={60}
            max={600}
            value={preferences.autoSaveInterval}
            onChange={(value) =>
              updatePreferences({ autoSaveInterval: value || 300 })
            }
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item label="显示行号" help="在代码预览中显示行号">
          <Switch
            checked={preferences.showLineNumbers}
            onChange={(checked) =>
              updatePreferences({ showLineNumbers: checked })
            }
          />
        </Form.Item>

        <Form.Item label="启用热重载" help="文件变更时自动刷新预览">
          <Switch
            checked={preferences.enableHotReload}
            onChange={(checked) =>
              updatePreferences({ enableHotReload: checked })
            }
          />
        </Form.Item>

        <Form.Item label="默认工具态" help="打开页面时默认启用的工具">
          <Radio.Group
            value={preferences.defaultTool}
            onChange={(e) =>
              updatePreferences({ defaultTool: e.target.value })
            }
          >
            <Radio.Button value="none">纯预览</Radio.Button>
            <Radio.Button value="inspect">编辑</Radio.Button>
            <Radio.Button value="mark">标记</Radio.Button>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Drawer>
  );
}

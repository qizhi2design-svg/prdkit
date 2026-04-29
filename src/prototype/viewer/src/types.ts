// 视图模式类型
export type ViewMode = 'preview' | 'inspect' | 'mark';

// 原型节点类型
export interface PrototypeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: PrototypeNode[];
}

// 标记数据结构
export interface Mark {
  id: string;
  title: string; // 标记标题
  selector: string; // CSS 选择器，用于定位元素
  domPath: string; // DOM 层级路径（如 div > section > input#username）
  description: string; // Markdown 描述内容
  position: {
    x: number; // 标记点在页面中的 x 坐标
    y: number; // 标记点在页面中的 y 坐标
  };
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  }; // 元素的位置和尺寸
  timestamp: number; // 创建时间戳
}

// 标记列表响应
export interface MarksResponse {
  marks: Mark[];
}

// 待创建标记的元素信息
export interface PendingMarkInfo {
  selector: string;
  domPath: string; // DOM 层级路径
  position: {
    x: number;
    y: number;
  };
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

# Mark 隐藏元素叠加层优化设计文档

## 背景

CLI viewer 的 mark 叠加层渲染逻辑之前仅通过 `findElementBySelector` 检查目标元素在 DOM 中是否存在，未检测元素是否实际可见。当标记位于已关闭的弹窗/模态框内（`display:none`、`visibility:hidden`），叠加层仍然会在页面空白位置渲染。

## 方案

核心可见性检查 + `hiddenMarkIds` UI 反馈。

## 改动文件

| 文件 | 改动 |
|------|------|
| `utils/domUtils.ts` | 新增 `isElementVisible()` 工具函数 |
| `components/Preview.tsx` | 叠加层渲染加入可见性检查；扩展 `updateMissingMarks` → `updateMarkStates` |
| `components/MarkPanel.tsx` | 新增 `hiddenMarkIds` prop，列表显示"隐藏"标签，详情显示提示卡片 |
| `components/MarkPanel.css` | 隐藏标签和卡片样式 |
| `hooks/data/useMarks.ts` | 新增 `hiddenMarkIds` state + `setHiddenMarkIds` |
| `types/hooks.ts` | `UseMarksReturn` 新增 `hiddenMarkIds`、`setHiddenMarkIds` |
| `App.tsx` | 连接 `onMarkVisibilityChange` 回调和 `hiddenMarkIds` prop |

## 数据流

```
MutationObserver (检测弹窗开/关)
  → setOverlayRefreshTick
  → React 重渲染
  → 叠加层循环: findElementBySelector → isElementVisible → 渲染/不渲染
  → updateMarkStates effect: 计算 missingMarkIds + hiddenMarkIds
  → MarkPanel 显示对应标签
```

## 三种标记状态

- **正常**: 元素在 DOM 中且可见 → 叠加层显示
- **隐藏**(新增): 元素在 DOM 中但不可见 → 叠加层隐藏，面板显示黄色"隐藏"标签
- **缺失**: 元素不在 DOM 中 → 叠加层隐藏，面板显示红色"缺失"+重绑定

## 边界情况

- `opacity:0` → 叠加层显示（按设计保留）
- 旧浏览器无 `checkVisibility` → 回退 `offsetParent` + 计算样式遍历
- 跨域 iframe → 已有 try/catch 保护

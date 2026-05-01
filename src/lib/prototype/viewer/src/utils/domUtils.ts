/**
 * DOM 元素信息工具函数
 */

export interface ElementInfo {
  element: HTMLElement;
  info: string;
}

/**
 * 生成唯一的 CSS 选择器
 */
export function generateUniqueSelector(element: HTMLElement): string {
  // 如果有 id，直接使用 id
  if (element.id) {
    return `#${element.id}`;
  }

  // 构建选择器路径
  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    let selector = current.tagName.toLowerCase();

    // 添加 id
    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break; // id 是唯一的，可以停止
    }

    // 添加 class
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.split(' ').filter(Boolean);
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }

    // 添加 nth-child 以确保唯一性
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children);
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * 获取元素的 DOM 信息
 */
export function getElementInfo(
  element: HTMLElement,
  projectName: string,
  prototypesDir: string,
  filePath: string | null
): string {
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
  const selector = `${tagName}${id}${classes}`;

  // 获取属性
  const attrs: string[] = [];
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name !== 'class' && attr.name !== 'id') {
      attrs.push(`${attr.name}="${attr.value}"`);
    }
  }

  // 获取文本内容（只取直接子文本节点）
  const textContent = Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent?.trim())
    .filter(Boolean)
    .join(' ');

  // 获取外层 HTML（限制长度）
  const outerHTML = element.outerHTML.length > 500
    ? element.outerHTML.substring(0, 500) + '...'
    : element.outerHTML;

  // 构建完整的文件路径（绝对路径）
  let fullPath = '';
  if (prototypesDir && filePath) {
    fullPath = `${prototypesDir}/${filePath}/index.html`;
  } else if (filePath) {
    fullPath = `${filePath}/index.html`;
  }

  // 获取文件名
  const fileName = fullPath ? fullPath.split('/').pop() : '';

  // 格式化输出
  let info = `项目: ${projectName}\n`;
  info += `文件: ${fullPath}\n`;
  if (fileName) info += `文件名: ${fileName}\n`;
  info += `\n元素选择器: ${selector}\n`;
  info += `标签: <${tagName}>\n`;
  if (id) info += `ID: ${element.id}\n`;
  if (element.className) info += `类名: ${element.className}\n`;
  if (attrs.length > 0) info += `属性: ${attrs.join(', ')}\n`;
  if (textContent) info += `文本内容: ${textContent}\n`;
  info += `\nHTML:\n${outerHTML}`;

  return info;
}

/**
 * 获取元素的 DOM 层级路径
 * 例如: div > section > input#username
 */
export function getElementPath(element: HTMLElement): string {
  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    const tagName = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : '';
    const classes = current.className && typeof current.className === 'string'
      ? `.${current.className.split(' ').filter(Boolean).join('.')}`
      : '';

    path.unshift(`${tagName}${id}${classes}`);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * 格式化多个选中元素的信息
 */
export function formatMultipleElementsInfo(
  selectedElements: ElementInfo[],
  projectName: string,
  prototypesDir: string,
  filePath: string | null
): string {
  // 构建完整路径（绝对路径）
  let fullPath = '';
  if (prototypesDir && filePath) {
    fullPath = `${prototypesDir}/${filePath}/index.html`;
  } else if (filePath) {
    fullPath = `${filePath}/index.html`;
  }
  const fileName = fullPath ? fullPath.split('/').pop() : '';

  // 拼接所有元素信息
  let combinedInfo = `项目: ${projectName}\n`;
  combinedInfo += `文件: ${fullPath}\n`;
  if (fileName) combinedInfo += `文件名: ${fileName}\n`;
  combinedInfo += `\n========================================\n`;
  combinedInfo += `选中了 ${selectedElements.length} 个元素\n`;
  combinedInfo += `========================================\n\n`;

  selectedElements.forEach(({ info }, index) => {
    // 从 info 中提取元素信息（跳过项目、文件、文件名部分）
    const lines = info.split('\n');
    const elementInfoStart = lines.findIndex(line => line.includes('元素选择器:'));
    const elementInfo = lines.slice(elementInfoStart).join('\n');

    combinedInfo += `=== 元素 ${index + 1} ===\n`;
    combinedInfo += elementInfo;
    combinedInfo += '\n\n';
  });

  return combinedInfo;
}

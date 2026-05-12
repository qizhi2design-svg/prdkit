/**
 * DOM 元素信息工具函数
 */

export interface ElementInfo {
  element: HTMLElement;
  info: string;
}

function escapeCssIdentifier(value: string): string {
  if (typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function') {
    return globalThis.CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function getClassTokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

function getEscapedClassSelector(className: string): string {
  return getClassTokens(className)
    .map((token) => `.${escapeCssIdentifier(token)}`)
    .join('');
}

function getRawClassSelector(className: string): string {
  const tokens = getClassTokens(className);
  return tokens.length > 0 ? `.${tokens.join('.')}` : '';
}

interface LegacySelectorSegment {
  tagName: string | null;
  id: string | null;
  classBlob: string | null;
  nthChild: number | null;
}

function parseLegacySelectorSegment(segment: string): LegacySelectorSegment | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  const nthChildMatch = trimmed.match(/:nth-child\((\d+)\)$/);
  const nthChild = nthChildMatch ? Number.parseInt(nthChildMatch[1], 10) : null;
  const segmentBody = nthChildMatch ? trimmed.slice(0, nthChildMatch.index) : trimmed;

  if (segmentBody.startsWith('#')) {
    return {
      tagName: null,
      id: segmentBody.slice(1),
      classBlob: null,
      nthChild,
    };
  }

  const firstDotIndex = segmentBody.indexOf('.');
  const tagName = (firstDotIndex === -1 ? segmentBody : segmentBody.slice(0, firstDotIndex)).trim().toLowerCase();
  const classBlob = firstDotIndex === -1 ? null : segmentBody.slice(firstDotIndex + 1);

  return {
    tagName: tagName || null,
    id: null,
    classBlob: classBlob || null,
    nthChild,
  };
}

function matchesLegacySelectorSegment(element: Element, segment: LegacySelectorSegment): boolean {
  if (segment.id && element.id !== segment.id) {
    return false;
  }

  if (segment.tagName && element.tagName.toLowerCase() !== segment.tagName) {
    return false;
  }

  if (segment.classBlob) {
    const className = typeof (element as HTMLElement).className === 'string'
      ? (element as HTMLElement).className
      : (element.getAttribute('class') ?? '');
    const normalizedClassBlob = getClassTokens(className).join('.');
    if (normalizedClassBlob !== segment.classBlob) {
      return false;
    }
  }

  if (segment.nthChild !== null) {
    const parent = element.parentElement;
    if (!parent) {
      return false;
    }

    const index = Array.from(parent.children).indexOf(element) + 1;
    if (index !== segment.nthChild) {
      return false;
    }
  }

  return true;
}

function getDescendants(root: Document | Element): Element[] {
  if ('querySelectorAll' in root) {
    return Array.from(root.querySelectorAll('*'));
  }

  return [];
}

function findElementByLegacySelector(root: Document | Element, selector: string): Element | null {
  const segments = selector
    .split(' > ')
    .map(parseLegacySelectorSegment)
    .filter((segment): segment is LegacySelectorSegment => segment !== null);

  if (segments.length === 0) {
    return null;
  }

  let currentMatches = getDescendants(root).filter((element) => matchesLegacySelectorSegment(element, segments[0]));
  if (currentMatches.length === 0) {
    return null;
  }

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    currentMatches = currentMatches.flatMap((parent) =>
      Array.from(parent.children).filter((child) => matchesLegacySelectorSegment(child, segment))
    );

    if (currentMatches.length === 0) {
      return null;
    }
  }

  return currentMatches[0] ?? null;
}

/**
 * 检查元素是否在页面中实际可见
 * 使用 checkVisibility() API，不兼容时回退到 offsetParent + 计算样式遍历
 */
export function isElementVisible(element: Element, ownerDocument?: Document): boolean {
  // 透明度为0视为不可见（检查自身及所有祖先）
  const win = ownerDocument?.defaultView;
  if (win) {
    let current: Element | null = element;
    while (current) {
      if (parseFloat(win.getComputedStyle(current).opacity) === 0) return false;
      current = current.parentElement;
    }
  }

  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility();
  }

  // Legacy fallback
  const el = element as HTMLElement;
  if (el.offsetParent === null) {
    if (!ownerDocument?.contains(element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
  }

  let current: Element | null = element;
  while (current && win) {
    const style = win.getComputedStyle(current);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    current = current.parentElement;
  }

  return true;
}

/**
 * 检查元素是否被其他元素视觉覆盖（如弹窗遮罩层）
 * 使用 elementsFromPoint API 检测目标元素的中心点是否被非祖先元素遮挡
 */
export function isElementCovered(element: Element, iframeDoc: Document): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let topElements: Element[];
  try {
    topElements = Array.from(iframeDoc.elementsFromPoint(centerX, centerY));
  } catch {
    return false; // 跨域或其他错误，假设未被覆盖
  }

  for (const el of topElements) {
    if (el === element) return false;         // mark 元素在最顶部
    if (el.contains(element)) continue;       // mark 的祖先——跳过
    if (element.contains(el)) continue;       // mark 的后代——跳过
    if (el.tagName === 'HTML' || el.tagName === 'BODY') continue;
    return true;                              // 有其他元素覆盖在 mark 之上
  }

  return false;
}

export function findElementBySelector(root: Document | Element, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return findElementByLegacySelector(root, selector);
  }
}

/**
 * 生成唯一的 CSS 选择器
 */
export function generateUniqueSelector(element: HTMLElement): string {
  // 如果有 id，直接使用 id
  if (element.id) {
    return `#${escapeCssIdentifier(element.id)}`;
  }

  // 构建选择器路径
  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.tagName.toLowerCase() !== 'html') {
    let selector = current.tagName.toLowerCase();

    // 添加 id
    if (current.id) {
      selector = `#${escapeCssIdentifier(current.id)}`;
      path.unshift(selector);
      break; // id 是唯一的，可以停止
    }

    // 添加 class
    if (current.className && typeof current.className === 'string') {
      selector += getEscapedClassSelector(current.className);
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
  const id = element.id ? `#${escapeCssIdentifier(element.id)}` : '';
  const classes = typeof element.className === 'string'
    ? getEscapedClassSelector(element.className)
    : '';
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
      ? getRawClassSelector(current.className)
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

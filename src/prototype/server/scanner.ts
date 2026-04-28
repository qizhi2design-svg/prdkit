import fs from 'fs';
import path from 'path';

export interface PrototypeNode {
  id: string;              // 唯一标识
  name: string;            // 文件/文件夹名称
  type: 'folder' | 'file'; // 类型
  path: string;            // 相对路径（相对于 prototypes 目录）
  children?: PrototypeNode[]; // 子节点
}

/**
 * 扫描原型目录，生成树形结构
 * @param rootDir prototypes 目录的绝对路径
 * @returns 树形结构的根节点
 */
export function scanPrototypes(rootDir: string): PrototypeNode {
  const rootName = path.basename(rootDir);

  const root: PrototypeNode = {
    id: 'root',
    name: rootName,
    type: 'folder',
    path: '',
    children: []
  };

  if (!fs.existsSync(rootDir)) {
    return root;
  }

  root.children = scanDirectory(rootDir, rootDir);
  return root;
}

/**
 * 递归扫描目录
 * @param dirPath 当前目录的绝对路径
 * @param rootDir prototypes 目录的绝对路径
 * @returns 子节点数组
 */
function scanDirectory(dirPath: string, rootDir: string): PrototypeNode[] {
  const nodes: PrototypeNode[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // 跳过隐藏文件和特殊目录
      if (entry.name.startsWith('.') || entry.name === 'assets') {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        // 检查是否是原型目录（包含 index.html）
        const indexPath = path.join(fullPath, 'index.html');
        const isPrototype = fs.existsSync(indexPath);

        if (isPrototype) {
          // 这是一个原型文件
          nodes.push({
            id: relativePath.replace(/\\/g, '/'),
            name: entry.name,
            type: 'file',
            path: relativePath.replace(/\\/g, '/')
          });
        } else {
          // 这是一个普通文件夹，递归扫描
          const children = scanDirectory(fullPath, rootDir);
          if (children.length > 0) {
            nodes.push({
              id: relativePath.replace(/\\/g, '/'),
              name: entry.name,
              type: 'folder',
              path: relativePath.replace(/\\/g, '/'),
              children
            });
          }
        }
      }
    }
  } catch (error) {
    console.error(`扫描目录失败: ${dirPath}`, error);
  }

  return nodes;
}

/**
 * 将树形结构扁平化为路径列表
 * @param node 树形结构节点
 * @returns 原型路径数组
 */
export function flattenPrototypes(node: PrototypeNode): string[] {
  const paths: string[] = [];

  function traverse(n: PrototypeNode) {
    if (n.type === 'file') {
      paths.push(n.path);
    }
    if (n.children) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return paths;
}

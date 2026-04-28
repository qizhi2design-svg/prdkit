import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';
import { scanPrototypes, flattenPrototypes, type PrototypeNode } from './server/scanner.js';

interface Mark {
  id: string;
  title: string;
  selector: string;
  elementInfo?: any;
  domPath?: string;
  description: string;
  position?: any;
  rect?: any;
  timestamp: number;
}

interface PublishData {
  prototypes: PrototypeNode;
  marks: Record<string, Mark[]>;
  config: {
    projectName: string;
  };
}

/**
 * 收集原型数据
 */
function collectPrototypeData(
  prototypesDir: string,
  selectedPrototypes: string[],
  projectName: string
): PublishData {
  // 扫描所有原型
  const allPrototypes = scanPrototypes(prototypesDir);

  // 过滤选中的原型
  const filteredPrototypes = filterPrototypes(allPrototypes, selectedPrototypes);

  // 收集标记数据
  const marks: Record<string, Mark[]> = {};
  for (const prototypePath of selectedPrototypes) {
    const marksDir = path.join(prototypesDir, prototypePath, 'marks');
    if (fs.existsSync(marksDir)) {
      marks[prototypePath] = readMarks(marksDir);
    }
  }

  return {
    prototypes: filteredPrototypes,
    marks,
    config: {
      projectName
    }
  };
}

/**
 * 过滤原型树，只保留选中的原型
 */
function filterPrototypes(
  node: PrototypeNode,
  selectedPaths: string[]
): PrototypeNode {
  const filtered: PrototypeNode = {
    ...node,
    children: []
  };

  if (node.children) {
    for (const child of node.children) {
      if (child.type === 'file') {
        // 如果是文件，检查是否在选中列表中
        if (selectedPaths.includes(child.path)) {
          filtered.children!.push(child);
        }
      } else {
        // 如果是文件夹，递归过滤
        const filteredChild = filterPrototypes(child, selectedPaths);
        if (filteredChild.children && filteredChild.children.length > 0) {
          filtered.children!.push(filteredChild);
        }
      }
    }
  }

  return filtered;
}

/**
 * 读取标记数据
 */
function readMarks(marksDir: string): Mark[] {
  const marks: Mark[] = [];

  try {
    const files = fs.readdirSync(marksDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(marksDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data, content: description } = matter(content);

      marks.push({
        id: data.id,
        title: data.title || '标记',
        selector: data.selector,
        elementInfo: data.elementInfo,
        domPath: data.domPath,
        description: description.trim(),
        position: data.position,
        rect: data.rect,
        timestamp: data.timestamp
      });
    }

    // 按时间戳排序
    marks.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error('读取标记失败:', error);
  }

  return marks;
}

/**
 * 构建只读版本的 viewer
 */
async function buildReadonlyViewer(
  viewerDir: string,
  data: PublishData
): Promise<string> {
  // 1. 将数据写入临时文件
  const dataPath = path.join(viewerDir, '.publish-data.json');
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  try {
    // 2. 执行构建
    console.log('正在构建只读版本...');
    execSync('pnpm build:publish', {
      cwd: viewerDir,
      stdio: 'inherit'
    });

    // 3. 返回构建输出目录
    const outputDir = path.resolve(viewerDir, '../../../dist/viewer-publish');
    return outputDir;
  } finally {
    // 4. 清理临时文件
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
    }
  }
}

/**
 * 复制原型文件到输出目录
 */
function copyPrototypeFiles(
  prototypesDir: string,
  selectedPrototypes: string[],
  outputDir: string
): void {
  const prototypesOutputDir = path.join(outputDir, 'prototypes');

  // 创建 prototypes 目录
  if (!fs.existsSync(prototypesOutputDir)) {
    fs.mkdirSync(prototypesOutputDir, { recursive: true });
  }

  // 复制每个原型的文件
  for (const prototypePath of selectedPrototypes) {
    const sourceDir = path.join(prototypesDir, prototypePath);
    const targetDir = path.join(prototypesOutputDir, prototypePath);

    // 创建目标目录
    fs.mkdirSync(targetDir, { recursive: true });

    // 复制 index.html
    const indexSource = path.join(sourceDir, 'index.html');
    const indexTarget = path.join(targetDir, 'index.html');
    if (fs.existsSync(indexSource)) {
      fs.copyFileSync(indexSource, indexTarget);
    }

    // 复制 assets 目录（如果存在）
    const assetsSource = path.join(sourceDir, 'assets');
    const assetsTarget = path.join(targetDir, 'assets');
    if (fs.existsSync(assetsSource)) {
      copyDirectory(assetsSource, assetsTarget);
    }
  }
}

/**
 * 递归复制目录
 */
function copyDirectory(source: string, target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * 发布原型
 */
export async function publishPrototypes(
  prototypesDir: string,
  selectedPrototypes: string[],
  outputPath: string,
  projectName: string = 'PRDKit'
): Promise<void> {
  console.log('开始打包原型...');
  console.log('选中的原型:', selectedPrototypes);
  console.log('输出路径:', outputPath);

  // 1. 收集原型数据
  console.log('收集原型数据...');
  const data = collectPrototypeData(prototypesDir, selectedPrototypes, projectName);

  // 2. 构建只读版本的 viewer
  const viewerDir = path.resolve(__dirname, '../viewer');
  const buildOutputDir = await buildReadonlyViewer(viewerDir, data);

  // 3. 复制原型文件
  console.log('复制原型文件...');
  copyPrototypeFiles(prototypesDir, selectedPrototypes, buildOutputDir);

  // 4. 复制构建产物到目标路径
  console.log('复制到目标路径...');
  if (fs.existsSync(outputPath)) {
    // 如果目标路径存在，先清空
    fs.rmSync(outputPath, { recursive: true, force: true });
  }
  copyDirectory(buildOutputDir, outputPath);

  console.log('打包完成！');
  console.log('输出目录:', outputPath);
}

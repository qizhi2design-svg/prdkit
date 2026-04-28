import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';
import archiver from 'archiver';
import { scanPrototypes, flattenPrototypes, type PrototypeNode } from './server/scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  htmlContents: Record<string, string>; // 原型路径 -> HTML 内容
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

  // 收集 HTML 内容
  const htmlContents: Record<string, string> = {};
  for (const prototypePath of selectedPrototypes) {
    const htmlPath = path.join(prototypesDir, prototypePath, 'index.html');
    if (fs.existsSync(htmlPath)) {
      let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      // 转换资源路径为相对于根目录的路径
      htmlContent = transformResourcePaths(htmlContent, prototypePath);
      htmlContents[prototypePath] = htmlContent;
    }
  }

  return {
    prototypes: filteredPrototypes,
    marks,
    htmlContents,
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
 * 转换 HTML 中的资源路径为相对于根目录的路径
 */
function transformResourcePaths(html: string, prototypePath: string): string {
  // 转换相对路径为绝对路径（相对于打包根目录）
  // 例如：./assets/image.png -> prototypes/xxx/assets/image.png

  // 替换 src 属性
  html = html.replace(/src=["']\.\/([^"']+)["']/g, `src="prototypes/${prototypePath}/$1"`);
  html = html.replace(/src=["']([^"':\/][^"']*)["']/g, `src="prototypes/${prototypePath}/$1"`);

  // 替换 href 属性
  html = html.replace(/href=["']\.\/([^"']+)["']/g, `href="prototypes/${prototypePath}/$1"`);
  html = html.replace(/href=["']([^"':\/][^"']*)["']/g, (match, p1) => {
    // 跳过 # 开头的锚点链接和 http(s):// 开头的外部链接
    if (p1.startsWith('#') || p1.startsWith('http://') || p1.startsWith('https://')) {
      return match;
    }
    return `href="prototypes/${prototypePath}/${p1}"`;
  });

  return html;
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
    execSync('npm run build:publish', {
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
 * 创建 ZIP 文件
 */
async function createZipFile(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 如果目标文件已存在，先删除
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // 创建输出流
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });

    // 监听事件
    output.on('close', () => {
      console.log(`ZIP 文件已创建: ${archive.pointer()} 字节`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    // 连接输出流
    archive.pipe(output);

    // 添加目录内容到 ZIP
    archive.directory(sourceDir, false);

    // 完成打包
    archive.finalize();
  });
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
  const viewerDir = path.resolve(__dirname, '../../src/prototype/viewer');
  const buildOutputDir = await buildReadonlyViewer(viewerDir, data);

  // 3. 复制原型文件
  console.log('复制原型文件...');
  copyPrototypeFiles(prototypesDir, selectedPrototypes, buildOutputDir);

  // 4. 创建 ZIP 文件
  console.log('创建 ZIP 文件...');
  await createZipFile(buildOutputDir, outputPath);

  console.log('打包完成！');
  console.log('输出文件:', outputPath);
}

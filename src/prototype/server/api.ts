import express, { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { scanPrototypes } from './scanner.js';
import { publishPrototypes } from '../publisher.js';

/** 从 markdown 正文中去除开头的 # Title 标题 */
function stripMarkdownTitle(content: string): string {
  return content.replace(/^#\s+.*(\r?\n|$)/, '').trimStart();
}

export function createApiRouter(prototypesDir: string): Router {
  const router = express.Router();

  // 添加 JSON 解析中间件
  router.use(express.json());

  // 获取原型列表
  router.get('/prototypes', (req: Request, res: Response) => {
    try {
      const tree = scanPrototypes(prototypesDir);
      res.json(tree);
    } catch (error) {
      console.error('扫描原型失败:', error);
      res.status(500).json({
        error: '扫描原型失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 获取项目配置
  router.get('/config', (req: Request, res: Response) => {
    try {
      // 从 prototypesDir 向上查找 .prdkit/config.json
      const projectRoot = path.dirname(path.dirname(prototypesDir));
      const configPath = path.join(projectRoot, '.prdkit', 'config.json');

      let config: any = { projectName: 'PRDKit' };

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
      }

      // 添加 prototypes 目录的绝对路径
      config.prototypesDir = prototypesDir;

      res.json(config);
    } catch (error) {
      console.error('读取配置失败:', error);
      res.json({ projectName: 'PRDKit', prototypesDir });
    }
  });

  // 获取标记列表
  router.get('/marks/:prototypeName', (req: Request, res: Response) => {
    try {
      const { prototypeName } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const marksDir = path.join(prototypesDir, protoName, 'marks');

      if (!fs.existsSync(marksDir)) {
        return res.json({ marks: [] });
      }

      // 读取所有 .md 文件
      const files = fs.readdirSync(marksDir).filter(f => f.endsWith('.md'));
      const marks = files.map(file => {
        const filePath = path.join(marksDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const { data, content: description } = matter(content);

        return {
          id: data.id,
          title: data.title || '标记',
          selector: data.selector,
          elementInfo: data.elementInfo,
          domPath: data.domPath,
          description: description.trim(),
          position: data.position,
          rect: data.rect,
          timestamp: data.timestamp
        };
      });

      // 按时间戳排序
      marks.sort((a, b) => a.timestamp - b.timestamp);

      res.json({ marks });
    } catch (error) {
      console.error('读取标记失败:', error);
      res.status(500).json({
        error: '读取标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 创建标记
  router.post('/marks/:prototypeName', (req: Request, res: Response) => {
    try {
      const { prototypeName } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const mark = req.body;

      const marksDir = path.join(prototypesDir, protoName, 'marks');

      // 确保 marks 目录存在
      if (!fs.existsSync(marksDir)) {
        fs.mkdirSync(marksDir, { recursive: true });
      }

      // 创建 markdown 文件
      const markFile = path.join(marksDir, `${mark.id}.md`);

      // 构建 frontmatter
      const frontmatter = {
        id: mark.id,
        title: mark.title,
        selector: mark.selector,
        elementInfo: mark.elementInfo,
        domPath: mark.domPath,
        position: mark.position,
        rect: mark.rect,
        timestamp: mark.timestamp
      };

      // 将 title 写入 markdown 正文作为 # 标题
      const descriptionWithTitle = mark.title
        ? `# ${mark.title}\n\n${mark.description || ''}`
        : (mark.description || '');
      const fileContent = matter.stringify(descriptionWithTitle, frontmatter);

      // 保存文件
      fs.writeFileSync(markFile, fileContent, 'utf-8');

      res.json({ success: true, mark });
    } catch (error) {
      console.error('创建标记失败:', error);
      res.status(500).json({
        error: '创建标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 更新标记
  router.put('/marks/:prototypeName/:markId', (req: Request, res: Response) => {
    try {
      const { prototypeName, markId } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const markIdStr = Array.isArray(markId) ? markId[0] : markId;
      const { title, description } = req.body;

      const marksDir = path.join(prototypesDir, protoName, 'marks');
      const markFile = path.join(marksDir, `${markIdStr}.md`);

      if (!fs.existsSync(markFile)) {
        return res.status(404).json({ error: '标记文件不存在' });
      }

      // 读取现有文件
      const content = fs.readFileSync(markFile, 'utf-8');
      const { data } = matter(content);

      // 更新 title（如果提供）
      if (title !== undefined) {
        data.title = title;
      }

      // 将 title 写入 markdown 正文作为 # 标题
      const finalTitle = title !== undefined ? title : (data.title || '标记');
      const descriptionWithTitle = `# ${finalTitle}\n\n${stripMarkdownTitle(description)}`;

      // 更新描述，保持其他 frontmatter 不变
      const fileContent = matter.stringify(descriptionWithTitle, data);

      // 保存文件
      fs.writeFileSync(markFile, fileContent, 'utf-8');

      res.json({ success: true });
    } catch (error) {
      console.error('更新标记失败:', error);
      res.status(500).json({
        error: '更新标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 删除标记
  router.delete('/marks/:prototypeName/:markId', (req: Request, res: Response) => {
    try {
      const { prototypeName, markId } = req.params;
      const protoName = Array.isArray(prototypeName) ? prototypeName[0] : prototypeName;
      const markIdStr = Array.isArray(markId) ? markId[0] : markId;

      const marksDir = path.join(prototypesDir, protoName, 'marks');
      const markFile = path.join(marksDir, `${markIdStr}.md`);

      if (!fs.existsSync(markFile)) {
        return res.status(404).json({ error: '标记文件不存在' });
      }

      // 删除文件
      fs.unlinkSync(markFile);

      res.json({ success: true });
    } catch (error) {
      console.error('删除标记失败:', error);
      res.status(500).json({
        error: '删除标记失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 发布原型 - 选择输出目录
  router.post('/select-directory', async (req: Request, res: Response) => {
    try {
      // 使用 osascript (macOS) 或其他方式选择目录
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      let selectedPath = '';

      if (process.platform === 'darwin') {
        // macOS
        const script = `osascript -e 'POSIX path of (choose folder with prompt "选择输出目录")'`;
        try {
          const { stdout } = await execAsync(script);
          selectedPath = stdout.trim();
        } catch (error) {
          // 用户取消选择
          return res.json({ path: null });
        }
      } else if (process.platform === 'win32') {
        // Windows - 使用 PowerShell
        const script = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = '选择输出目录'; $result = $dialog.ShowDialog(); if ($result -eq 'OK') { $dialog.SelectedPath }"`;
        try {
          const { stdout } = await execAsync(script);
          selectedPath = stdout.trim();
        } catch (error) {
          return res.json({ path: null });
        }
      } else {
        // Linux - 使用 zenity
        const script = `zenity --file-selection --directory --title="选择输出目录"`;
        try {
          const { stdout } = await execAsync(script);
          selectedPath = stdout.trim();
        } catch (error) {
          return res.json({ path: null });
        }
      }

      res.json({ path: selectedPath || null });
    } catch (error) {
      console.error('选择目录失败:', error);
      res.status(500).json({
        error: '选择目录失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 发布原型 - 执行打包
  router.post('/publish', async (req: Request, res: Response) => {
    try {
      const { prototypes, outputPath } = req.body;

      if (!prototypes || !Array.isArray(prototypes) || prototypes.length === 0) {
        return res.status(400).json({ error: '请选择要发布的原型' });
      }

      if (!outputPath) {
        return res.status(400).json({ error: '请选择输出路径' });
      }

      // 获取项目配置
      const projectRoot = path.dirname(path.dirname(prototypesDir));
      const configPath = path.join(projectRoot, '.prdkit', 'config.json');
      let projectName = 'PRDKit';

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        projectName = config.projectName || 'PRDKit';
      }

      // 执行打包
      await publishPrototypes(prototypesDir, prototypes, outputPath, projectName);

      res.json({
        success: true,
        message: '发布成功',
        outputPath
      });
    } catch (error) {
      console.error('发布失败:', error);
      res.status(500).json({
        error: '发布失败',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}

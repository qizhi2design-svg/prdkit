import express, { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { scanPrototypes } from './scanner.js';

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

  return router;
}

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { requireCloudHost, loadConfig, loadCloudConfig, updateCloudConfig } from '#utils/config.js';
import { createCloudClient } from '../../cloud/client.js';
import { buildDefaultPublishDirName, publishArtifacts } from '../publish.js';
import { registerReleaseLink } from '../../links/registry.js';
import type { ApiHelpers } from './helpers.js';

export function createPublishRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { projectRoot, prototypesDir } = helpers;

  router.get('/publish/options', (_req: Request, res: Response) => {
    try {
      const configPath = path.join(projectRoot, '.prdkit', 'config.json');
      let projectName = 'PRDKit';

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as { projectName?: string };
        projectName = config.projectName || projectName;
      }

      const defaultOutputRoot = path.join(projectRoot, 'dist', 'publish');
      const suggestedArtifactName = buildDefaultPublishDirName(projectName);
      const suggestedOutputPath = path.join(defaultOutputRoot, suggestedArtifactName);

      res.json({
        projectName,
        defaultOutputRoot,
        suggestedArtifactName,
        suggestedOutputPath,
      });
    } catch (error) {
      console.error('读取发布配置失败:', error);
      res.status(500).json({
        error: '读取发布配置失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/publish', async (req: Request, res: Response) => {
    try {
      const { outputPath, entryFiles, projectName } = req.body as {
        outputPath?: string;
        entryFiles?: string[];
        projectName?: string;
      };

      if (!outputPath || typeof outputPath !== 'string') {
        return res.status(400).json({ error: '缺少输出路径 outputPath' });
      }

      if (!Array.isArray(entryFiles) || entryFiles.length === 0) {
        return res.status(400).json({ error: '请至少选择一个需要发布的页面' });
      }

      const configPath = path.join(projectRoot, '.prdkit', 'config.json');
      let resolvedProjectName = projectName || 'PRDKit';

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as { projectName?: string };
        resolvedProjectName = config.projectName || resolvedProjectName;
      }

      const result = await publishArtifacts({
        projectRoot,
        prototypesDir,
        outputDir: path.resolve(outputPath),
        projectName: resolvedProjectName,
        entryFiles,
      });

      res.json({
        success: true,
        outputDir: result.outputDir,
        entryCount: result.manifest.entryFiles.length,
      });
    } catch (error) {
      console.error('发布产物失败:', error);
      res.status(500).json({
        error: '发布产物失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post('/publish-cloud', async (req: Request, res: Response) => {
    try {
      const { projectId, message, entryFiles } = req.body as {
        projectId?: string;
        message?: string;
        entryFiles?: string[];
      };
      const { publishToCloud } = await import('../../cloud/publisher.js');
      const config = await loadConfig(projectRoot);
      const cloudConfig = await loadCloudConfig(projectRoot);

      if (!config) {
        return res.status(400).json({ error: '未找到项目配置' });
      }
      if (!cloudConfig) {
        return res.status(400).json({ error: '未找到云端配置' });
      }

      if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ error: '缺少 projectId' });
      }

      const result = await publishToCloud({
        projectRoot,
        config,
        cloudConfig,
        message,
        entryFiles,
        project: projectId,
      });

      const host = await requireCloudHost(projectRoot);
      const client = await createCloudClient(host);
      const projects = await client.listProjects().catch(() => []);
      const selectedProject = projects.find((item) => item.id === result.projectId);
      await updateCloudConfig(projectRoot, {
        projectId: result.projectId,
        projectSlug: selectedProject?.slug,
        projectName: selectedProject?.name,
        lastReleaseId: result.releaseId,
        lastPublishedAt: new Date().toISOString(),
      });

      await registerReleaseLink(projectRoot, {
        releaseId: result.releaseId,
        projectId: result.projectId,
        url: result.releaseUrl,
        prototypePaths: result.results.map((r) => r.prototypePath),
        source: "viewer-publish",
        publishedAt: new Date().toISOString(),
      }).catch(() => {
        console.warn('注册 release 链接失败，不影响发布结果');
      });

      res.json({
        success: true,
        result,
        project: selectedProject ?? null,
      });
    } catch (error) {
      console.error('云端发布失败:', error);
      res.status(500).json({
        error: '云端发布失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

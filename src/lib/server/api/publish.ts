import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { requireCloudHost, loadConfig, loadCloudConfig, updateCloudConfig } from '#utils/config.js';
import { createCloudClient } from '../../cloud/client.js';
import { buildDefaultPublishDirName, publishArtifacts } from '../publish.js';
import { buildDefaultPrdPublishDirName, publishPrdArtifacts } from '../prd-publish.js';
import { registerReleaseLink } from '../../links/registry.js';
import type { ApiHelpers } from './helpers.js';

export function createPublishRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { projectRoot, prototypesDir } = helpers;

  router.get('/publish/options', (req: Request, res: Response) => {
    try {
      const configPath = path.join(projectRoot, '.prdkit', 'config.json');
      let projectName = 'PRDKit';

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as { projectName?: string };
        projectName = config.projectName || projectName;
      }

      const target = req.query.target === 'prd' ? 'prd' : 'prototype';
      const defaultOutputRoot = path.join(projectRoot, 'dist', 'publish');
      const suggestedArtifactName = target === 'prd'
        ? buildDefaultPrdPublishDirName(projectName)
        : buildDefaultPublishDirName(projectName);
      const suggestedOutputPath = path.join(defaultOutputRoot, suggestedArtifactName);

      res.json({
        target,
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
        target?: 'prototype' | 'prd';
      };
      const target = req.body?.target === 'prd' ? 'prd' : 'prototype';

      if (!outputPath || typeof outputPath !== 'string') {
        return res.status(400).json({ error: '缺少输出路径 outputPath' });
      }

      if (!Array.isArray(entryFiles) || entryFiles.length === 0) {
        return res.status(400).json({ error: target === 'prd' ? '请至少选择一份需要发布的 PRD 文档' : '请至少选择一个需要发布的页面' });
      }

      const configPath = path.join(projectRoot, '.prdkit', 'config.json');
      let resolvedProjectName = projectName || 'PRDKit';

      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent) as { projectName?: string };
        resolvedProjectName = config.projectName || resolvedProjectName;
      }

      const result = target === 'prd'
        ? await publishPrdArtifacts({
            projectRoot,
            outputDir: path.resolve(outputPath),
            projectName: resolvedProjectName,
            entryFiles,
          })
        : await publishArtifacts({
            projectRoot,
            prototypesDir,
            outputDir: path.resolve(outputPath),
            projectName: resolvedProjectName,
            entryFiles,
          });

      res.json({
        success: true,
        target,
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
      const { projectId, message, entryFiles, target } = req.body as {
        projectId?: string;
        message?: string;
        entryFiles?: string[];
        target?: 'prototype' | 'prd';
      };
      const publishTarget = target === 'prd' ? 'prd' : 'prototype';
      const [{ publishToCloud }, { publishPrdsToCloud }] = await Promise.all([
        import('../../cloud/publisher.js'),
        import('../../cloud/prd-publisher.js'),
      ]);
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

      const result = publishTarget === 'prd'
        ? await publishPrdsToCloud({
            projectRoot,
            config,
            cloudConfig,
            message,
            entryFiles,
            project: projectId,
          })
        : await publishToCloud({
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
      const listedProject = projects.find((item) => item.id === result.projectId);
      const selectedProject = isValidProjectSummary(listedProject)
        ? listedProject
        : await client.getProject(result.projectId).catch(() => listedProject);
      await updateCloudConfig(projectRoot, {
        projectId: result.projectId,
        projectSlug: isNonEmptyString(selectedProject?.slug) ? selectedProject.slug : undefined,
        projectName: isNonEmptyString(selectedProject?.name) ? selectedProject.name : undefined,
        lastReleaseId: result.releaseId,
        lastPublishedAt: new Date().toISOString(),
      });

      await registerReleaseLink(projectRoot, {
        releaseId: result.releaseId,
        projectId: result.projectId,
        url: result.releaseUrl,
        prototypePaths: publishTarget === 'prd'
          ? []
          : result.results
              .map((r) => ('prototypePath' in r ? r.prototypePath : null))
              .filter((item): item is string => Boolean(item)),
        source: "viewer-publish",
        publishedAt: new Date().toISOString(),
      }).catch(() => {
        console.warn('注册 release 链接失败，不影响发布结果');
      });

      res.json({
        success: true,
        target: publishTarget,
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value !== 'undefined' && value !== 'null';
}

function isValidProjectSummary(
  value: { id?: unknown; name?: unknown; slug?: unknown } | undefined
): value is { id: string; name: string; slug: string } {
  return Boolean(value && isNonEmptyString(value.id) && isNonEmptyString(value.name) && isNonEmptyString(value.slug));
}

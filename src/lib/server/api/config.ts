import { Router, Request, Response } from 'express';
import {
  getAuthRecord,
  loadCloudConfig,
  loadConfig,
  resolveCloudHost,
} from '#utils/config.js';
import type { PrdkitConfig } from '#types/index.js';
import { CloudApiError, createCloudClient } from '../../cloud/client.js';
import { DEFAULT_VIEWER_SKILLS } from '../../constants/index.js';
import { readViewerSkills } from './helpers.js';
import type { ApiHelpers } from './helpers.js';

export function createConfigRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { projectRoot, prototypesDir } = helpers;

  router.get('/config', async (req: Request, res: Response) => {
    try {
      let config: any = { projectName: 'PRDKit' };

      const loadedConfig = await loadConfig(projectRoot);
      if (loadedConfig) {
        config = loadedConfig;
      }

      config.prototypesDir = prototypesDir;
      config.viewerSkills = readViewerSkills(projectRoot, config as PrdkitConfig);

      const cloudConfig = await loadCloudConfig(projectRoot);
      const host = await resolveCloudHost(projectRoot);
      if (cloudConfig) {
        const authRecord = await getAuthRecord(host);
        let authStatus: 'loggedOut' | 'expired' | 'active' = 'loggedOut';

        if (authRecord) {
          if (new Date(authRecord.expiresAt).getTime() > Date.now()) {
            authStatus = 'active';
          } else {
            try {
              const client = await createCloudClient(host);
              await client.ensureValidAuth();
              authStatus = 'active';
            } catch {
              authStatus = 'expired';
            }
          }
        }

        config.cloud = {
          host,
          projectId: cloudConfig.projectId,
          projectName: cloudConfig.projectName,
          projectSlug: cloudConfig.projectSlug,
          authStatus,
          lastReleaseId: cloudConfig.lastReleaseId,
          lastPublishedAt: cloudConfig.lastPublishedAt,
        };
      }

      res.json(config);
    } catch (error) {
      console.error('读取配置失败:', error);
      res.json({ projectName: 'PRDKit', prototypesDir, viewerSkills: DEFAULT_VIEWER_SKILLS });
    }
  });

  return router;
}

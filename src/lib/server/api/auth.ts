import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import open from 'open';
import { requireCloudHost } from '#utils/config.js';
import { CloudApiError, createCloudClient } from '../../cloud/client.js';
import { renderAuthCallbackHtml } from './helpers.js';
import type { ApiHelpers } from './helpers.js';

export function createAuthRouter(helpers: ApiHelpers): Router {
  const router = Router();
  const { projectRoot, pendingViewerLogins, toProjectSlug } = helpers;

  const handleListCloudProjects = async (req: Request, res: Response) => {
    try {
      const host = await requireCloudHost(projectRoot);
      const client = await createCloudClient(host);
      await client.ensureValidAuth();
      const projects = await client.listProjects();

      res.json({
        success: true,
        projects,
      });
    } catch (error) {
      console.error('读取云端项目失败:', error);
      res.status(500).json({
        error: '读取云端项目失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleCreateCloudProject = async (req: Request, res: Response) => {
    try {
      const { name } = req.body as { name?: string };
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: '缺少项目名称 name' });
      }

      const host = await requireCloudHost(projectRoot);
      const client = await createCloudClient(host);
      await client.ensureValidAuth();
      const trimmedName = name.trim();
      let project;
      let created = true;

      try {
        project = await client.createProject({ name: trimmedName });
      } catch (error) {
        if (!(error instanceof CloudApiError) || error.status !== 409) {
          throw error;
        }

        const fallbackSlug = toProjectSlug(trimmedName);
        const projects = await client.listProjects();
        const existingProject = projects.find(
          (item) => item.name === trimmedName || item.slug === fallbackSlug,
        );
        if (!existingProject) {
          throw error;
        }
        project = existingProject;
        created = false;
      }

      res.json({
        success: true,
        created,
        project,
      });
    } catch (error) {
      console.error('创建云端项目失败:', error);
      res.status(500).json({
        error: '创建云端项目失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  router.get('/cloud/projects', handleListCloudProjects);
  router.post('/cloud/projects', handleCreateCloudProject);
  router.get('/projects', handleListCloudProjects);
  router.post('/projects', handleCreateCloudProject);

  router.get('/auth/callback', async (req: Request, res: Response) => {
    try {
      const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
      const callbackToken = typeof req.query.callbackToken === 'string' ? req.query.callbackToken.trim() : '';
      const error = typeof req.query.error === 'string' ? req.query.error.trim() : '';
      const pending = state ? pendingViewerLogins.get(state) : undefined;

      if (!state) {
        return res.status(400).send(renderAuthCallbackHtml('登录失败', '缺少 state'));
      }

      if (error) {
        pending?.reject(new Error(error));
        if (pending) {
          clearTimeout(pending.timer);
          pendingViewerLogins.delete(state);
        }
        return res.status(400).send(renderAuthCallbackHtml('登录失败', error));
      }

      if (!callbackToken) {
        pending?.reject(new Error('登录失败：缺少 callbackToken'));
        if (pending) {
          clearTimeout(pending.timer);
          pendingViewerLogins.delete(state);
        }
        return res.status(400).send(renderAuthCallbackHtml('登录失败', '缺少 callbackToken'));
      }

      const host = await requireCloudHost(projectRoot);
      const client = await createCloudClient(host);
      const authRecord = await client.exchangeBrowserLogin(callbackToken);

      pending?.resolve(authRecord);
      if (pending) {
        clearTimeout(pending.timer);
        pendingViewerLogins.delete(state);
      }

      res.status(200).send(renderAuthCallbackHtml('登录成功', '您可以关闭此窗口并返回发布面板。'));
    } catch (error) {
      const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
      const pending = state ? pendingViewerLogins.get(state) : undefined;
      pending?.reject(error instanceof Error ? error : new Error(String(error)));
      if (pending) {
        clearTimeout(pending.timer);
        pendingViewerLogins.delete(state);
      }
      console.error('处理浏览器登录回调失败:', error);
      res.status(500).send(renderAuthCallbackHtml('登录失败', error instanceof Error ? error.message : '登录失败'));
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const host = await requireCloudHost(projectRoot);
      const client = await createCloudClient(host);
      const viewerPort = req.get('host')?.split(':')[1] || '7790';
      const state = crypto.randomBytes(16).toString('hex');
      const callbackUrl = `http://127.0.0.1:${viewerPort}/api/auth/callback?state=${encodeURIComponent(state)}`;
      const session = await client.startBrowserLogin('prdkit-viewer', process.env.HOSTNAME || 'viewer', callbackUrl);
      const timeoutMs = Math.max(new Date(session.expiresAt).getTime() - Date.now(), 1_000);
      const authPromise = new Promise<import('#types/index.js').AuthHostRecord>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingViewerLogins.delete(state);
          reject(new Error('登录已超时，请重新点击登录'));
        }, timeoutMs);

        pendingViewerLogins.set(state, {
          resolve: (record) => {
            clearTimeout(timer);
            resolve(record);
          },
          reject: (loginError) => {
            clearTimeout(timer);
            reject(loginError);
          },
          timer,
        });
      });

      const cloudUrl = new URL(host);
      const loginUrl = new URL(session.loginUrl);
      loginUrl.protocol = cloudUrl.protocol;
      loginUrl.host = cloudUrl.host;

      console.log(`\n请在浏览器中完成登录：${loginUrl.toString()}`);
      console.log(`登录完成后将回调到：${callbackUrl}\n`);

      try {
        await open(loginUrl.toString());
      } catch {
        console.warn('自动打开浏览器失败，请手动访问上面的地址完成登录');
      }

      const authRecord = await authPromise;

      res.json({
        success: true,
        message: '登录成功',
        user: authRecord.user,
      });
    } catch (error) {
      console.error('启动登录流程失败:', error);
      res.status(500).json({
        error: '启动登录流程失败',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}

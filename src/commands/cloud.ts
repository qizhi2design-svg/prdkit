import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { COPY } from "#constants/command-text.js";
import { logger } from "#utils/logger.js";
import {
  ensureCloudConfig,
  loadCloudConfig,
  requireCloudHost,
  switchCloudHost,
  listAuthenticatedHosts,
  getAuthRecord,
  saveGlobalConfig,
  loadGlobalConfig,
  normalizeHost,
  resolveProjectRoot,
  saveCloudConfig,
  DEFAULT_CLOUD_HOST,
} from "#utils/config.js";
import { findAvailablePort } from "#utils/port.js";
import type { CloudProjectSummary, PrdkitCloudConfig } from "#types/index.js";

const CALLBACK_PATH = "/auth/callback";

function renderCallbackHtml(title: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: sans-serif; padding: 48px 24px; text-align: center; color: #111827; }
      h1 { margin-bottom: 12px; }
      p { color: #4b5563; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${description}</p>
  </body>
</html>`;
}

export function registerCloud(program: Command): void {
  const cloud = program
    .command("cloud")
    .description(COPY.cloudDescription)
    .addHelpText("after", `\n默认服务器地址：${DEFAULT_CLOUD_HOST}`);

  // cloud list
  cloud
    .command("list")
    .alias("ls")
    .description(COPY.cloudListDescription)
    .action(async () => {
      const currentCloud = await loadCloudConfig().catch(() => undefined);
      const currentHost = currentCloud?.host ?? "(none)";

      logger.info(`当前云端地址: ${currentHost}`);

      const hosts = await listAuthenticatedHosts();
      if (hosts.length === 0) {
        logger.info("未找到已认证的云端服务器");
        return;
      }

      logger.info("已认证的服务器:");
      for (const h of hosts) {
        const isCurrent = currentCloud?.host && normalizeHost(currentCloud.host) === h.host;
        const marker = isCurrent ? "* " : "  ";
        const statusLabel = h.status === "active" ? "已登录" : "已过期";
        const email = h.user?.email ?? "";
        logger.info(`${marker}${h.host} (${statusLabel}) ${email}`);
      }
    });

  // cloud switch <host>
  cloud
    .command("switch <host>")
    .alias("sw")
    .description(COPY.cloudSwitchDescription)
    .action(async (host: string) => {
      const normalized = normalizeHost(host);
      const nextConfig = await switchCloudHost(normalized);
      logger.success(`已切换到云端服务器: ${normalized}`);

      const auth = await getAuthRecord(normalized);
      if (!auth) {
        logger.warn("该服务器尚未登录，请运行: prdkit cloud login");
      } else if (new Date(auth.expiresAt).getTime() <= Date.now()) {
        logger.warn("该服务器的登录已过期，请重新登录: prdkit cloud login");
      } else {
        logger.info(`当前用户: ${auth.user.email}`);
      }

      if (nextConfig.projectId) {
        logger.info(`项目 ID: ${nextConfig.projectId}`);
      }
    });

  // cloud login [host]
  cloud
    .command("login [host]")
    .description(COPY.cloudLoginDescription)
    .action(async (host?: string) => {
      let targetHost: string;
      if (host) {
        targetHost = normalizeHost(host);
      } else {
        await ensureCloudConfig(process.cwd(), {
          promptMessage: "输入云端服务器地址",
        });
        targetHost = await requireCloudHost();
      }
      await performCloudLogin(targetHost);
    });

  // cloud logout [host]
  cloud
    .command("logout [host]")
    .alias("out")
    .description(COPY.cloudLogoutDescription)
    .action(async (host?: string) => {
      let targetHost: string;
      if (host) {
        targetHost = normalizeHost(host);
      } else {
        const cloudConfig = await loadCloudConfig();
        if (!cloudConfig?.host) {
          throw new Error("当前项目未配置云端服务器，请指定要注销的服务器地址");
        }
        targetHost = cloudConfig.host;
      }

      const { createCloudClient } = await import("#lib/cloud/client.js");
      const client = await createCloudClient(targetHost);
      await client.logout();
      logger.success(`已从 ${targetHost} 注销登录`);
    });

  // cloud set-default <host>
  cloud
    .command("set-default <host>")
    .alias("default")
    .description(COPY.cloudSetDefaultDescription)
    .action(async (host: string) => {
      const normalized = normalizeHost(host);
      const globalConfig = await loadGlobalConfig();
      await saveGlobalConfig({
        ...globalConfig,
        cloud: { ...globalConfig.cloud, defaultHost: normalized },
      });
      logger.success(`全局默认服务器已设置为: ${normalized}`);
    });

  const project = cloud
    .command("project")
    .alias("projects")
    .description(COPY.cloudProjectDescription);

  project
    .command("create <name>")
    .description(COPY.cloudProjectCreateDescription)
    .option("--slug <slug>", "指定项目 slug")
    .option("-d, --description <description>", "项目说明")
    .addHelpText("after", `\n${COPY.cloudProjectCreateHelpAfter}`)
    .action(async (name: string, options: { slug?: string; description?: string }) => {
      const { client } = await getAuthenticatedCloudClient();
      const project = await client.createProject({
        name: name.trim(),
        slug: options.slug?.trim(),
        description: options.description?.trim(),
      });
      logger.success(`已创建云端项目：${project.name}`);
      logger.info(`项目 ID: ${project.id}`);
      logger.info(`项目 slug: ${project.slug}`);
    });

  project
    .command("update <idOrSlug>")
    .description(COPY.cloudProjectUpdateDescription)
    .option("--name <name>", "新的项目名称")
    .option("-d, --description <description>", "新的项目说明")
    .option("--clear-description", "清空项目说明")
    .addHelpText("after", `\n${COPY.cloudProjectUpdateHelpAfter}`)
    .action(async (idOrSlug: string, options: { name?: string; description?: string; clearDescription?: boolean }) => {
      const trimmedName = options.name?.trim();
      const hasDescription = typeof options.description === "string";
      const hasClearDescription = Boolean(options.clearDescription);

      if (!trimmedName && !hasDescription && !hasClearDescription) {
        throw new Error("请至少提供 --name、--description 或 --clear-description 中的一项");
      }
      if (hasDescription && hasClearDescription) {
        throw new Error("--description 与 --clear-description 不能同时使用");
      }

      const { client, projectRoot, cloudConfig } = await getAuthenticatedCloudClient();
      const targetProject = await resolveCloudProject(client, idOrSlug);
      const updated = await client.updateProject(targetProject.id, {
        ...(trimmedName ? { name: trimmedName } : {}),
        ...(hasClearDescription ? { description: null } : hasDescription ? { description: options.description ?? "" } : {}),
      });

      await syncLocalProjectMeta(projectRoot, cloudConfig, updated);
      logger.success(`已更新云端项目：${updated.name}`);
      logger.info(`项目 ID: ${updated.id}`);
      logger.info(`项目 slug: ${updated.slug}`);
    });

  project
    .command("delete <idOrSlug>")
    .description(COPY.cloudProjectDeleteDescription)
    .option("-y, --yes", "跳过删除确认")
    .addHelpText("after", `\n${COPY.cloudProjectDeleteHelpAfter}`)
    .action(async (idOrSlug: string, options: { yes?: boolean }) => {
      const { client, projectRoot, cloudConfig } = await getAuthenticatedCloudClient();
      const targetProject = await resolveCloudProject(client, idOrSlug);

      if (!options.yes) {
        const shouldDelete = await confirm({
          message: `确认删除云端项目「${targetProject.name}」(${targetProject.slug}) 吗？此操作不可恢复`,
          default: false,
        });
        if (!shouldDelete) {
          logger.info("已取消删除");
          return;
        }
      }

      await client.deleteProject(targetProject.id);
      await clearLocalProjectMetaIfMatches(projectRoot, cloudConfig, targetProject);
      logger.success(`已删除云端项目：${targetProject.name}`);
      logger.info(`项目 ID: ${targetProject.id}`);
    });
}

async function getAuthenticatedCloudClient(): Promise<{
  client: Awaited<ReturnType<typeof import("#lib/cloud/client.js").createCloudClient>>;
  host: string;
  projectRoot?: string;
  cloudConfig?: PrdkitCloudConfig;
}> {
  const projectRoot = await resolveProjectRoot(process.cwd());
  const cloudConfig = await loadCloudConfig(process.cwd()).catch(() => undefined);
  const host = cloudConfig?.host
    ? normalizeHost(cloudConfig.host)
    : await requireCloudHost(process.cwd());
  const { createCloudClient } = await import("#lib/cloud/client.js");
  const client = await createCloudClient(host);
  await client.ensureValidAuth();
  return { client, host, projectRoot, cloudConfig };
}

async function resolveCloudProject(
  client: Awaited<ReturnType<typeof import("#lib/cloud/client.js").createCloudClient>>,
  idOrSlug: string
): Promise<CloudProjectSummary> {
  const identifier = idOrSlug.trim();
  if (!identifier) {
    throw new Error("缺少项目 ID 或 slug");
  }

  const byId = await client.getProject(identifier).catch(() => undefined);
  if (byId) {
    return byId;
  }

  const bySlug = await client.resolveProjectBySlug(identifier).catch(() => undefined);
  if (bySlug) {
    return bySlug;
  }

  throw new Error(`未找到云端项目：${identifier}`);
}

async function syncLocalProjectMeta(
  projectRoot: string | undefined,
  cloudConfig: PrdkitCloudConfig | undefined,
  project: CloudProjectSummary
): Promise<void> {
  if (!projectRoot || !cloudConfig) {
    return;
  }
  if (cloudConfig.projectId !== project.id && cloudConfig.projectSlug !== project.slug) {
    return;
  }

  await saveCloudConfig({
    ...cloudConfig,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
  }, projectRoot);
}

async function clearLocalProjectMetaIfMatches(
  projectRoot: string | undefined,
  cloudConfig: PrdkitCloudConfig | undefined,
  project: CloudProjectSummary
): Promise<void> {
  if (!projectRoot || !cloudConfig) {
    return;
  }
  if (cloudConfig.projectId !== project.id && cloudConfig.projectSlug !== project.slug) {
    return;
  }

  await saveCloudConfig({
    version: cloudConfig.version,
    host: cloudConfig.host,
    lastReleaseId: cloudConfig.lastReleaseId,
    lastPublishedAt: cloudConfig.lastPublishedAt,
  }, projectRoot);
}

async function performCloudLogin(host: string): Promise<void> {
  const [{ default: open }, { createCloudClient }, os, http] = await Promise.all([
    import("open"),
    import("#lib/cloud/client.js"),
    import("node:os"),
    import("node:http"),
  ]);

  const client = await createCloudClient(host);
  const port = await findAvailablePort(57530, 57630);
  const callbackUrl = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const session = await client.startBrowserLogin("prdkit", os.hostname(), callbackUrl);

  const authPromise = new Promise<Awaited<ReturnType<typeof client.exchangeBrowserLogin>>>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || "/", callbackUrl);

      if (req.method !== "GET" || requestUrl.pathname !== CALLBACK_PATH) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not Found");
        return;
      }

      const callbackToken = requestUrl.searchParams.get("callbackToken")?.trim() || "";
      const error = requestUrl.searchParams.get("error")?.trim() || "";

      const finish = (handler: () => void) => {
        server.close(() => {
          handler();
        });
      };

      if (error) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderCallbackHtml("登录失败", error));
        finish(() => reject(new Error(error)));
        return;
      }

      if (!callbackToken) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderCallbackHtml("登录失败", "缺少 callbackToken"));
        finish(() => reject(new Error("登录失败：缺少 callbackToken")));
        return;
      }

      void client
        .exchangeBrowserLogin(callbackToken)
        .then((record) => {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(renderCallbackHtml("登录成功", "您可以关闭此窗口并返回 prdkit。"));
          finish(() => resolve(record));
        })
        .catch((exchangeError) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(renderCallbackHtml("登录失败", exchangeError instanceof Error ? exchangeError.message : "登录失败"));
          finish(() => reject(exchangeError));
        });
    });

    const timeoutMs = Math.max(new Date(session.expiresAt).getTime() - Date.now(), 1_000);
    const timer = setTimeout(() => {
      server.close(() => {
        reject(new Error("登录已超时，请重新运行 prdkit cloud login"));
      });
    }, timeoutMs);

    server.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    server.listen(port, "127.0.0.1");

    server.on("close", () => {
      clearTimeout(timer);
    });
  });

  const cloudUrl = new URL(host);
  const loginUrl = new URL(session.loginUrl);
  loginUrl.protocol = cloudUrl.protocol;
  loginUrl.host = cloudUrl.host;

  logger.info(`请在浏览器中完成登录：${loginUrl.toString()}`);
  logger.info(`登录完成后将自动回调到：${callbackUrl}`);

  try {
    await open(loginUrl.toString());
  } catch {
    logger.warn("自动打开浏览器失败，请手动访问上面的地址完成登录");
  }

  const spinner = logger.spinner("等待浏览器完成登录...").start();
  try {
    const authRecord = await authPromise;
    spinner.succeed(`登录成功：${authRecord.user.email}`);
  } catch (error) {
    spinner.fail("登录失败");
    throw error;
  }
}

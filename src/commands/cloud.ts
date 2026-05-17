import { Command } from "commander";
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
  DEFAULT_CLOUD_HOST,
} from "#utils/config.js";
import { findAvailablePort } from "#utils/port.js";

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

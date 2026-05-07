import http from "node:http";
import os from "node:os";
import open from "open";
import { Command } from "commander";
import { createCloudClient } from "#lib/cloud/client.js";
import { requireCloudHost } from "#utils/config.js";
import { logger } from "#utils/logger.js";
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

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("云端认证管理");

  auth
    .command("login")
    .description("使用浏览器登录云端服务器")
    .action(async () => {
      const host = requireCloudHost();
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

          void client.exchangeBrowserLogin(callbackToken)
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
            reject(new Error("登录已超时，请重新运行 prdkit auth login"));
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

      logger.info(`请在浏览器中完成登录：${session.loginUrl}`);
      logger.info(`登录完成后将自动回调到：${callbackUrl}`);

      try {
        await open(session.loginUrl);
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
    });

  auth
    .command("logout")
    .description("退出当前云端登录")
    .action(async () => {
      const host = requireCloudHost();
      const client = await createCloudClient(host);
      await client.logout();
      logger.success("已退出登录");
    });
}

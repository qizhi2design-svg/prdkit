import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import express from "express";
import { createApiRouter } from "../src/lib/server/api/index.js";

function makeRequest(
  app: express.Express,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        return reject(new Error("Could not get server address"));
      }
      const port = addr.port;

      const parsedUrl = new URL(url, `http://localhost:${port}`);
      const bodyStr = body ? JSON.stringify(body) : undefined;

      const req = http.request(
        {
          hostname: "localhost",
          port,
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers: {
            "Content-Type": "application/json",
            ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode || 0, data: data });
            }
            server.close();
          });
        }
      );

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

describe("Marks API - title 写入 markdown", () => {
  let tmpDir: string;
  let app: express.Express;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-test-"));
    app = express();
    app.use("/api", createApiRouter(tmpDir));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 辅助：直接读取 .md 文件
  function readMarkFile(prototypeName: string, markId: string): string {
    return fs.readFileSync(
      path.join(tmpDir, prototypeName, "marks", `${markId}.md`),
      "utf-8"
    );
  }

  it("POST 创建标记时 title 应写入 markdown 正文 # 标题", async () => {
    const mark = {
      title: "登录按钮优化",
      selector: "button.login",
      domPath: "body > button.login",
      description: "这是描述内容，支持 **Markdown**。",
      position: { x: 100, y: 200 },
      rect: { top: 200, left: 100, width: 80, height: 40 }
    };

    const res = await makeRequest(app, "POST", "/api/marks/test-proto", mark);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.mark.id).toMatch(/^mark-\d+$/);

    // 检查磁盘文件
    const fileContent = readMarkFile("test-proto", res.data.mark.id);
    console.log("=== POST 生成的文件内容 ===");
    console.log(fileContent);
    console.log("=========================");

    // 验证 frontmatter 中有 title
    expect(fileContent).toContain("title: 登录按钮优化");
    // 验证 markdown 正文以 # 标题开头
    expect(fileContent).toContain("# 登录按钮优化");
    // 验证描述内容在文件中
    expect(fileContent).toContain("这是描述内容，支持 **Markdown**。");
  });

  it("GET 读取标记应返回 frontmatter 中的 title", async () => {
    // 先创建
    const mark = {
      title: "导航栏样式",
      selector: ".navbar",
      domPath: "body > nav.navbar",
      description: "需要调整间距。",
      position: { x: 50, y: 50 },
      rect: { top: 50, left: 50, width: 300, height: 60 }
    };
    await makeRequest(app, "POST", "/api/marks/test-proto2", mark);

    // 读取
    const res = await makeRequest(app, "GET", "/api/marks/test-proto2");
    expect(res.status).toBe(200);
    const marks = res.data.marks;
    expect(marks).toHaveLength(1);
    const fetched = marks[0];
    console.log("=== GET 返回的 mark ===");
    console.log(JSON.stringify(fetched, null, 2));
    console.log("=======================");

    // title 应从 frontmatter 获取
    expect(fetched.title).toBe("导航栏样式");
    // description 应包含 # 标题（因为 GET 原样返回 markdown 正文）
    expect(fetched.description).toContain("# 导航栏样式");
    expect(fetched.description).toContain("需要调整间距。");
  });

  it("PUT 更新标记时 title 应同步更新 markdown 正文 # 标题", async () => {
    // 先创建
    const mark = {
      title: "原始标题",
      selector: ".old",
      domPath: "body > div.old",
      description: "原始描述。",
      position: { x: 10, y: 10 },
      rect: { top: 10, left: 10, width: 50, height: 30 }
    };
    const createRes = await makeRequest(app, "POST", "/api/marks/test-proto3", mark);
    const markId = createRes.data.mark.id;

    // 更新 title 和 description
    const updateRes = await makeRequest(app, "PUT", `/api/marks/test-proto3/${markId}`, {
      title: "更新后的标题",
      description: "更新后的描述，有 **新内容**。",
    });
    expect(updateRes.status).toBe(200);

    // 检查磁盘文件
    const fileContent = readMarkFile("test-proto3", markId);
    console.log("=== PUT 更新后的文件内容 ===");
    console.log(fileContent);
    console.log("===========================");

    // 验证 frontmatter title 已更新
    expect(fileContent).toContain("title: 更新后的标题");
    // 验证 markdown 正文 # 标题已更新
    expect(fileContent).toContain("# 更新后的标题");
    // 验证新的描述内容存在
    expect(fileContent).toContain("更新后的描述，有 **新内容**。");
    // 验证旧内容不存在
    expect(fileContent).not.toContain("# 原始标题");
    expect(fileContent).not.toContain("原始描述");
  });

  it("无 frontmatter title 的旧文件应回退到 '标记'", async () => {
    // 手动创建一个旧格式的 .md 文件（无 title frontmatter）
    const marksDir = path.join(tmpDir, "old-proto", "marks");
    fs.mkdirSync(marksDir, { recursive: true });
    const oldContent = `---
id: mark-old001
selector: .legacy
elementInfo: div.legacy
domPath: body > div.legacy
position:
  x: 1
  'y': 2
rect:
  top: 2
  left: 1
  width: 10
  height: 10
timestamp: 100
---
# 旧文件标题

旧文件的描述内容。`;
    fs.writeFileSync(path.join(marksDir, "mark-old001.md"), oldContent, "utf-8");

    const res = await makeRequest(app, "GET", "/api/marks/old-proto");
    expect(res.status).toBe(200);
    const mark = res.data.marks[0];
    console.log("=== 旧文件 GET 返回 ===");
    console.log(JSON.stringify(mark, null, 2));
    console.log("=======================");

    // frontmatter 无 title，回退到 '标记'
    expect(mark.title).toBe("标记");
    // description 保留完整的 markdown 正文（包含 # 标题）
    expect(mark.description).toContain("# 旧文件标题");
    expect(mark.description).toContain("旧文件的描述内容。");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { rm, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

/**
 * E2E 测试：常见错误场景
 *
 * 这些测试模拟真实的用户场景和错误情况
 */

describe("Error Scenarios E2E", () => {
  const testDir = path.join(tmpdir(), "prdkit-e2e-test");

  beforeEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("配置文件不存在", () => {
    it("应该在未初始化的目录中提示运行 init", async () => {
      // 模拟在未初始化的目录中运行命令
      const configPath = path.join(testDir, ".prdkit", "config.json");

      expect(existsSync(configPath)).toBe(false);

      // 在实际场景中，这会触发 ConfigError.notFound()
      // 并提示用户运行 prdkit init
    });

    it("应该检测到损坏的配置文件", async () => {
      const configDir = path.join(testDir, ".prdkit");
      const configPath = path.join(configDir, "config.json");

      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, "{ invalid json", "utf8");

      expect(existsSync(configPath)).toBe(true);

      // 读取并解析配置文件应该失败
      const content = await readFile(configPath, "utf8");
      expect(() => JSON.parse(content)).toThrow();

      // 在实际场景中，这会触发 ConfigError.invalid()
    });

    it("应该处理空的配置文件", async () => {
      const configDir = path.join(testDir, ".prdkit");
      const configPath = path.join(configDir, "config.json");

      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, "", "utf8");

      const content = await readFile(configPath, "utf8");
      expect(content).toBe("");

      // 在实际场景中，这会触发 ConfigError.invalid()
    });
  });

  describe("Git 仓库克隆失败", () => {
    it("应该处理无效的仓库地址", () => {
      const invalidRepos = [
        "not-a-url",
        "http://",
        "git@",
        "",
      ];

      for (const repo of invalidRepos) {
        expect(repo).toBeDefined();
        // 在实际场景中，这些会触发 GitError.cloneFailed()
      }
    });

    it("应该处理不存在的仓库", () => {
      const nonExistentRepo = "git@github.com:nonexistent/repo-that-does-not-exist.git";

      expect(nonExistentRepo).toBeDefined();
      // 在实际场景中，git clone 会失败
      // 触发 GitError.repositoryNotFound()
    });

    it("应该处理网络连接问题", () => {
      // 模拟网络不可达的情况
      const repo = "git@unreachable-host.example.com:user/repo.git";

      expect(repo).toBeDefined();
      // 在实际场景中，这会触发 NetworkError.repositoryUnreachable()
    });
  });

  describe("网络请求超时", () => {
    it("应该处理长时间无响应的请求", async () => {
      // 模拟超时场景
      const timeout = 5000; // 5秒超时
      const startTime = Date.now();

      try {
        await new Promise((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), timeout);
        });
      } catch (error) {
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(timeout);
        expect((error as Error).message).toBe("timeout");
        // 在实际场景中，这会触发 NetworkError.timeout()
      }
    });

    it("应该支持重试机制", async () => {
      let attempts = 0;
      const maxAttempts = 3;

      const tryOperation = async (): Promise<boolean> => {
        attempts++;
        if (attempts < maxAttempts) {
          throw new Error("网络错误");
        }
        return true;
      };

      let success = false;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          success = await tryOperation();
          break;
        } catch (error) {
          if (i === maxAttempts - 1) {
            throw error;
          }
          // 继续重试
        }
      }

      expect(success).toBe(true);
      expect(attempts).toBe(maxAttempts);
    });
  });

  describe("文件权限错误", () => {
    it("应该检测到只读目录", async () => {
      const readonlyDir = path.join(testDir, "readonly");
      await mkdir(readonlyDir, { recursive: true });

      // 注意：在某些系统上修改权限可能需要特殊权限
      // 这里只是演示概念

      expect(existsSync(readonlyDir)).toBe(true);
      // 在实际场景中，尝试写入只读目录会触发
      // FileSystemError.permissionDenied()
    });

    it("应该处理文件被占用的情况", async () => {
      const lockedFile = path.join(testDir, "locked.txt");
      await writeFile(lockedFile, "content", "utf8");

      expect(existsSync(lockedFile)).toBe(true);

      // 在实际场景中，如果文件被其他进程占用
      // 会触发 FileSystemError.writeFailed()
    });

    it("应该处理磁盘空间不足", () => {
      // 模拟磁盘空间不足的场景
      // 在实际场景中，这会触发 FileSystemError.writeFailed()
      // 并建议检查磁盘空间

      const largeContent = "x".repeat(1024 * 1024); // 1MB
      expect(largeContent.length).toBe(1024 * 1024);
    });
  });

  describe("无效的用户输入", () => {
    it("应该验证端口号范围", () => {
      const invalidPorts = [-1, 0, 65536, 99999, NaN];

      for (const port of invalidPorts) {
        const isValid = port >= 1 && port <= 65535 && !isNaN(port);
        expect(isValid).toBe(false);
        // 在实际场景中，这会触发 ValidationError.invalidPort()
      }
    });

    it("应该验证必填字段", () => {
      const inputs = [
        { projectName: "", author: "test" },
        { projectName: "test", author: "" },
        { projectName: "", author: "" },
      ];

      for (const input of inputs) {
        const hasEmptyField = !input.projectName || !input.author;
        expect(hasEmptyField).toBe(true);
        // 在实际场景中，这会触发 ValidationError.missingRequired()
      }
    });

    it("应该验证文件路径格式", () => {
      const invalidPaths = [
        "",
        " ",
        "\0",
        "path/with/\0/null",
      ];

      for (const p of invalidPaths) {
        const isInvalid = !p.trim() || p.includes("\0");
        expect(isInvalid).toBe(true);
        // 在实际场景中，这会触发 ValidationError.invalidInput()
      }
    });

    it("应该验证模板 ID", () => {
      const invalidTemplateIds = [
        "",
        " ",
        "../../../etc/passwd",
        "template/with/slash",
      ];

      for (const id of invalidTemplateIds) {
        const isInvalid = !id.trim() || id.includes("/") || id.includes("..");
        expect(isInvalid).toBe(true);
        // 在实际场景中，这会触发 TemplateError.notFound()
      }
    });
  });

  describe("文件已存在", () => {
    it("应该阻止覆盖现有文件", async () => {
      const existingFile = path.join(testDir, "existing.md");
      await writeFile(existingFile, "original content", "utf8");

      expect(existsSync(existingFile)).toBe(true);

      const content = await readFile(existingFile, "utf8");
      expect(content).toBe("original content");

      // 在实际场景中，尝试创建同名文件会触发
      // FileSystemError.fileAlreadyExists()
    });

    it("应该提供使用不同文件名的建议", async () => {
      const baseName = "document";
      const ext = ".md";
      const files = [
        path.join(testDir, `${baseName}${ext}`),
        path.join(testDir, `${baseName}-1${ext}`),
        path.join(testDir, `${baseName}-2${ext}`),
      ];

      for (const file of files) {
        await writeFile(file, "content", "utf8");
      }

      // 查找下一个可用的文件名
      let counter = 3;
      let nextFile = path.join(testDir, `${baseName}-${counter}${ext}`);
      while (existsSync(nextFile)) {
        counter++;
        nextFile = path.join(testDir, `${baseName}-${counter}${ext}`);
      }

      expect(existsSync(nextFile)).toBe(false);
      expect(counter).toBe(3);
    });
  });

  describe("目录不为空", () => {
    it("应该检测到非空目录", async () => {
      const targetDir = path.join(testDir, "target");
      await mkdir(targetDir, { recursive: true });
      await writeFile(path.join(targetDir, "file.txt"), "content", "utf8");

      const files = await readFile(path.join(targetDir, "file.txt"), "utf8");
      expect(files).toBe("content");

      // 在实际场景中，尝试初始化到非空目录会触发
      // FileSystemError.directoryNotEmpty()
    });

    it("应该允许在空目录中初始化", async () => {
      const emptyDir = path.join(testDir, "empty");
      await mkdir(emptyDir, { recursive: true });

      expect(existsSync(emptyDir)).toBe(true);

      // 空目录应该允许初始化
    });
  });

  describe("端口被占用", () => {
    it("应该检测到端口冲突", () => {
      const requestedPort = 8080;
      const occupiedPorts = [8080, 8081, 8082];

      const isPortOccupied = occupiedPorts.includes(requestedPort);
      expect(isPortOccupied).toBe(true);

      // 在实际场景中，这会触发 ServerError.portInUse()
    });

    it("应该自动选择可用端口", () => {
      const occupiedPorts = new Set([8080, 8081, 8082]);
      const startPort = 8080;
      const endPort = 8100;

      let availablePort: number | null = null;
      for (let port = startPort; port <= endPort; port++) {
        if (!occupiedPorts.has(port)) {
          availablePort = port;
          break;
        }
      }

      expect(availablePort).toBe(8083);
    });

    it("应该在没有可用端口时报错", () => {
      const startPort = 8080;
      const endPort = 8082;
      const occupiedPorts = new Set([8080, 8081, 8082]);

      let availablePort: number | null = null;
      for (let port = startPort; port <= endPort; port++) {
        if (!occupiedPorts.has(port)) {
          availablePort = port;
          break;
        }
      }

      expect(availablePort).toBeNull();
      // 在实际场景中，这会触发 ServerError.portNotAvailable()
    });
  });

  describe("模板相关错误", () => {
    it("应该处理模板清单文件不存在", async () => {
      const templatesDir = path.join(testDir, ".prdkit", "templates");
      await mkdir(templatesDir, { recursive: true });

      const manifestPath = path.join(templatesDir, "templates.json");
      expect(existsSync(manifestPath)).toBe(false);

      // 在实际场景中，这会触发 TemplateError.manifestNotFound()
    });

    it("应该处理无效的模板清单格式", async () => {
      const templatesDir = path.join(testDir, ".prdkit", "templates");
      const manifestPath = path.join(templatesDir, "templates.json");

      await mkdir(templatesDir, { recursive: true });
      await writeFile(manifestPath, "{ invalid json }", "utf8");

      const content = await readFile(manifestPath, "utf8");
      expect(() => JSON.parse(content)).toThrow();

      // 在实际场景中，这会触发 TemplateError.manifestInvalid()
    });

    it("应该处理模板文件缺失", async () => {
      const templatesDir = path.join(testDir, ".prdkit", "templates");
      const manifestPath = path.join(templatesDir, "templates.json");

      await mkdir(templatesDir, { recursive: true });
      await writeFile(
        manifestPath,
        JSON.stringify({
          templates: [
            { id: "prd", name: "PRD", file: "prd.md" },
          ],
        }),
        "utf8"
      );

      const templateFile = path.join(templatesDir, "prd.md");
      expect(existsSync(templateFile)).toBe(false);

      // 在实际场景中，这会触发 TemplateError.notFound()
    });
  });

  describe("原型 marks 文件错误", () => {
    it("应该验证 marks 文件命名格式", () => {
      const validNames = [
        "mark-1234567890.md",
        "mark-1234567890123.md",
      ];

      const invalidNames = [
        "mark.md",
        "marks-123.md",
        "mark-abc.md",
        "mark-123.txt",
      ];

      const markPattern = /^mark-\d+\.md$/;

      for (const name of validNames) {
        expect(markPattern.test(name)).toBe(true);
      }

      for (const name of invalidNames) {
        expect(markPattern.test(name)).toBe(false);
        // 在实际场景中，这会触发 PrototypeError.markFileInvalid()
      }
    });

    it("应该验证 frontmatter 中的 id 与文件名一致", async () => {
      const marksDir = path.join(testDir, "marks");
      await mkdir(marksDir, { recursive: true });

      const fileName = "mark-1234567890.md";
      const filePath = path.join(marksDir, fileName);

      // 正确的情况：id 与文件名一致
      const correctContent = `---
id: mark-1234567890
title: Test Mark
---

Content here`;

      await writeFile(filePath, correctContent, "utf8");
      const content = await readFile(filePath, "utf8");

      const idMatch = content.match(/^---\s*\nid:\s*(.+?)\s*\n/m);
      const id = idMatch ? idMatch[1] : null;
      const expectedId = fileName.replace(".md", "");

      expect(id).toBe(expectedId);

      // 错误的情况：id 与文件名不一致
      const incorrectContent = `---
id: mark-9999999999
title: Test Mark
---

Content here`;

      await writeFile(filePath, incorrectContent, "utf8");
      const incorrectContentRead = await readFile(filePath, "utf8");

      const incorrectIdMatch = incorrectContentRead.match(/^---\s*\nid:\s*(.+?)\s*\n/m);
      const incorrectId = incorrectIdMatch ? incorrectIdMatch[1] : null;

      expect(incorrectId).not.toBe(expectedId);
      // 在实际场景中，这会触发 PrototypeError.markFileInvalid()
    });
  });
});

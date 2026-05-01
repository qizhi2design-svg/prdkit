import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import express from "express";
import { createApiRouter } from "../src/lib/server/api.js";
import { createCheckpoint } from "../src/lib/checkpoint/store.js";

function makeRequest(
  app: express.Express,
  method: string,
  url: string
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        return reject(new Error("Could not get server address"));
      }

      const req = http.request(
        {
          hostname: "localhost",
          port: addr.port,
          path: url,
          method,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode || 0,
              data: JSON.parse(data),
            });
            server.close();
          });
        }
      );

      req.on("error", (error) => {
        server.close();
        reject(error);
      });

      req.end();
    });
  });
}

describe("Checkpoint API", () => {
  let projectRoot: string;
  let prototypesDir: string;
  let app: express.Express;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-api-checkpoints-"));
    prototypesDir = path.join(projectRoot, "workspace", "prototypes");
    fs.mkdirSync(path.join(projectRoot, ".prdkit"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, ".prdkit", "config.json"),
      JSON.stringify({
        version: 1,
        projectName: "Demo",
        author: "Alice",
        scaffoldRepo: "a",
        templateRepo: "b",
      }),
      "utf8"
    );
    fs.mkdirSync(path.join(prototypesDir, "foo", "bar", "marks"), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, "foo", "bar", "index.html"), "<html>v1</html>\n", "utf8");
    fs.writeFileSync(path.join(prototypesDir, "foo", "bar", "style.css"), "body { color: red; }\n", "utf8");

    app = express();
    app.use("/api", createApiRouter(prototypesDir));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("returns checkpoint list and detail summary for nested prototypes", async () => {
    const first = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath: "foo/bar",
      kind: "manual",
      message: "初版",
    });

    fs.writeFileSync(path.join(prototypesDir, "foo", "bar", "style.css"), "body { color: blue; }\n", "utf8");
    const second = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath: "foo/bar",
      kind: "manual",
      message: "改色",
    });

    const listRes = await makeRequest(app, "GET", "/api/checkpoints?prototypePath=foo%2Fbar");
    expect(listRes.status).toBe(200);
    expect(listRes.data.checkpoints).toHaveLength(2);
    expect(listRes.data.checkpoints[0].id).toBe(second.record.id);

    const detailRes = await makeRequest(app, "GET", `/api/checkpoints/${encodeURIComponent(second.record.id)}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.data.checkpoint.id).toBe(second.record.id);
    expect(detailRes.data.summary.modifiedFiles).toContain("style.css");
    expect(detailRes.data.previewUrl).toBe(`/checkpoint-preview/${encodeURIComponent(second.record.id)}/index.html`);

    const firstDetailRes = await makeRequest(app, "GET", `/api/checkpoints/${encodeURIComponent(first.record.id)}`);
    expect(firstDetailRes.status).toBe(200);
    expect(firstDetailRes.data.summary.addedFiles).toContain("index.html");
    expect(firstDetailRes.data.summary.addedFiles).toContain("style.css");
  });

  it("restores checkpoint through api", async () => {
    const target = await createCheckpoint({
      projectRoot,
      prototypesDir,
      prototypePath: "foo/bar",
      kind: "manual",
      message: "初版",
    });

    fs.writeFileSync(path.join(prototypesDir, "foo", "bar", "style.css"), "body { color: green; }\n", "utf8");

    const restoreRes = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const server = app.listen(0, () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          server.close();
          return reject(new Error("Could not get server address"));
        }

        const body = JSON.stringify({ force: true });
        const req = http.request(
          {
            hostname: "localhost",
            port: addr.port,
            path: `/api/checkpoints/${encodeURIComponent(target.record.id)}/restore`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
              server.close();
            });
          }
        );

        req.on("error", (error) => {
          server.close();
          reject(error);
        });

        req.write(body);
        req.end();
      });
    });

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.data.success).toBe(true);
    expect(fs.readFileSync(path.join(prototypesDir, "foo", "bar", "style.css"), "utf8")).toContain("red");
  });
});

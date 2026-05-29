import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import express from "express";
import { createApiRouter } from "../src/lib/server/api/index.js";

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

describe("Prototypes API", () => {
  let projectRoot: string;
  let prototypesDir: string;
  let app: express.Express;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prdkit-api-prototypes-"));
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

    fs.mkdirSync(prototypesDir, { recursive: true });
    fs.writeFileSync(
      path.join(prototypesDir, ".prdkitignore"),
      ["hidden-page", "group/internal/**", "!group/internal/keep-me"].join("\n"),
      "utf8"
    );
    fs.mkdirSync(path.join(prototypesDir, "visible-page"), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, "visible-page", "index.html"), "<html>visible</html>", "utf8");
    fs.mkdirSync(path.join(prototypesDir, "hidden-page"), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, "hidden-page", "index.html"), "<html>hidden</html>", "utf8");
    fs.mkdirSync(path.join(prototypesDir, "group", "internal", "drop-me"), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, "group", "internal", "drop-me", "index.html"), "<html>drop</html>", "utf8");
    fs.mkdirSync(path.join(prototypesDir, "group", "internal", "keep-me"), { recursive: true });
    fs.writeFileSync(path.join(prototypesDir, "group", "internal", "keep-me", "index.html"), "<html>keep</html>", "utf8");

    app = express();
    app.use("/api", createApiRouter(prototypesDir));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("returns a filtered tree for /api/prototypes", async () => {
    const response = await makeRequest(app, "GET", "/api/prototypes");

    expect(response.status).toBe(200);
    expect(response.data.children.map((node: { path: string }) => node.path)).toEqual(["group", "visible-page"]);

    const groupNode = response.data.children.find((node: { path: string }) => node.path === "group");
    expect(groupNode.children.map((node: { path: string }) => node.path)).toEqual(["group/internal"]);
    expect(groupNode.children[0].children.map((node: { path: string }) => node.path)).toEqual([
      "group/internal/keep-me",
    ]);
  });
});

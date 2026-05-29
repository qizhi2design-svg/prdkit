import { describe, expect, it, vi } from "vitest";
import { resolvePublishProjectId } from "../src/lib/cloud/publisher.js";
import type { PrdkitCloudConfig } from "../src/types/index.js";

describe("resolvePublishProjectId", () => {
  it("falls back to cached projectSlug when cached projectId is stale", async () => {
    const client = {
      getProject: vi.fn().mockRejectedValue(new Error("not found")),
      listProjects: vi.fn().mockResolvedValue([]),
      resolveProjectBySlug: vi.fn().mockResolvedValue({
        id: "proj-live-1",
        name: "Demo",
        slug: "demo-project",
      }),
    } as any;

    const cloudConfig: PrdkitCloudConfig = {
      version: 1,
      host: "http://localhost:3000",
      projectId: "cmpqzkxbj0002bln3jpfy9f01",
      projectSlug: "demo-project",
      projectName: "Demo",
    };

    await expect(resolvePublishProjectId(client, cloudConfig)).resolves.toBe("proj-live-1");
    expect(client.getProject).toHaveBeenCalledWith("cmpqzkxbj0002bln3jpfy9f01");
    expect(client.resolveProjectBySlug).toHaveBeenCalledWith("demo-project");
  });
});

import { strFromU8, unzipSync } from "fflate";
import type {
  AuthHostRecord,
  AuthenticatedUser,
  CloudCloneManifest,
  CloudProjectSummary,
  ReleaseCommitPayload,
  ReleaseCommitResult,
  ReleasePreparePrototype,
  ReleasePrepareResult,
  ReleaseStatusResult
} from "#types/index.js";
import {
  clearAuthRecord,
  getAuthRecord,
  normalizeHost,
  setAuthRecord
} from "#utils/config.js";

type JsonObject = Record<string, unknown>;

const BROWSER_DEVICE_QUERY = "?device=browser";
const AUTH_BROWSER_LOGIN_PATH = `/api/auth/login${BROWSER_DEVICE_QUERY}`;
const AUTH_BROWSER_EXCHANGE_PATH = `/api/auth/exchange${BROWSER_DEVICE_QUERY}`;
const AUTH_BROWSER_ME_PATH = `/api/auth/me${BROWSER_DEVICE_QUERY}`;
const AUTH_BROWSER_REFRESH_PATH = `/api/auth/refresh${BROWSER_DEVICE_QUERY}`;
const AUTH_BROWSER_LOGOUT_PATH = `/api/auth/logout${BROWSER_DEVICE_QUERY}`;

export type BrowserLoginStartResponse = {
  loginUrl: string;
  callbackToken: string;
  expiresAt: string;
};

export type BrowserLoginExchangeResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthenticatedUser;
  scopes?: string[];
};

export class CloudApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CloudApiError";
    this.status = status;
    this.code = code;
  }
}

export type CloudClientOptions = {
  host: string;
  auth?: AuthHostRecord;
  persistAuth?: (record: AuthHostRecord) => Promise<void>;
  clearAuth?: () => Promise<void>;
};

export class CloudClient {
  private readonly host: string;
  private auth?: AuthHostRecord;
  private readonly persistAuth?: (record: AuthHostRecord) => Promise<void>;
  private readonly clearAuthHandler?: () => Promise<void>;

  constructor(options: CloudClientOptions) {
    this.host = normalizeHost(options.host);
    this.auth = options.auth;
    this.persistAuth = options.persistAuth;
    this.clearAuthHandler = options.clearAuth;
  }

  get baseUrl(): string {
    return this.host;
  }

  get currentAuth(): AuthHostRecord | undefined {
    return this.auth;
  }

  async startBrowserLogin(
    clientName: string,
    machineName: string,
    callbackUrl: string
  ): Promise<BrowserLoginStartResponse> {
    return this.requestJson<BrowserLoginStartResponse>(AUTH_BROWSER_LOGIN_PATH, {
      method: "POST",
      body: JSON.stringify({ clientName, machineName, callbackUrl }),
      headers: {
        "Content-Type": "application/json",
      },
      skipAuthRefresh: true,
    });
  }

  async exchangeBrowserLogin(callbackToken: string): Promise<AuthHostRecord> {
    const result = await this.requestJson<BrowserLoginExchangeResponse>(AUTH_BROWSER_EXCHANGE_PATH, {
      method: "POST",
      body: JSON.stringify({ callbackToken }),
      headers: {
        "Content-Type": "application/json",
      },
      skipAuthRefresh: true,
    });

    const record: AuthHostRecord = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      user: result.user,
      scopes: result.scopes ?? [],
      lastValidatedAt: new Date().toISOString(),
    };
    await this.setAuth(record);
    return record;
  }

  async getCurrentUser(): Promise<AuthenticatedUser> {
    const response = await this.requestJson<{ user: AuthenticatedUser }>(AUTH_BROWSER_ME_PATH);
    return response.user;
  }

  async logout(): Promise<void> {
    if (this.auth?.refreshToken) {
      await this.requestJson(AUTH_BROWSER_LOGOUT_PATH, {
        method: "POST",
        body: JSON.stringify({ refreshToken: this.auth.refreshToken }),
        headers: { "Content-Type": "application/json" },
        skipAuthRefresh: true,
      }).catch(() => undefined);
    }

    this.auth = undefined;
    if (this.clearAuthHandler) {
      await this.clearAuthHandler();
    }
  }

  async listProjects(): Promise<CloudProjectSummary[]> {
    const response = await this.requestJson<{ projects: Array<any> }>("/api/projects");
    return (response.projects ?? []).map((project) => ({
      id: String(project.id),
      name: String(project.name),
      slug: String(project.slug),
      description: typeof project.description === "string" ? project.description : null,
      updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : undefined,
      prototypeCount: typeof project._count?.prototypes === "number" ? project._count.prototypes : undefined,
    }));
  }

  async resolveProjectBySlug(slug: string): Promise<CloudProjectSummary> {
    const response = await this.requestJson<{ project: any }>(`/api/projects/resolve?slug=${encodeURIComponent(slug)}`);
    return {
      id: String(response.project.id),
      name: String(response.project.name),
      slug: String(response.project.slug),
      description: typeof response.project.description === "string" ? response.project.description : null,
      updatedAt: typeof response.project.updatedAt === "string" ? response.project.updatedAt : undefined,
      prototypeCount: typeof response.project._count?.prototypes === "number" ? response.project._count.prototypes : undefined,
    };
  }

  async getProject(projectId: string): Promise<CloudProjectSummary> {
    const response = await this.requestJson<{ project: any }>(`/api/projects/${encodeURIComponent(projectId)}`);
    return {
      id: String(response.project.id),
      name: String(response.project.name),
      slug: String(response.project.slug),
      description: typeof response.project.description === "string" ? response.project.description : null,
      updatedAt: typeof response.project.updatedAt === "string" ? response.project.updatedAt : undefined,
      prototypeCount: Array.isArray(response.project.prototypes) ? response.project.prototypes.length : undefined,
    };
  }

  async downloadProjectArchive(projectId: string, versionNumber?: number): Promise<{
    fileName: string;
    buffer: Buffer;
    manifest: CloudCloneManifest;
  }> {
    const params = new URLSearchParams();
    if (versionNumber != null) {
      params.set("version", String(versionNumber));
    }
    const pathname = `/api/projects/${encodeURIComponent(projectId)}/download${params.size > 0 ? `?${params.toString()}` : ""}`;
    const response = await this.request(pathname, {
      method: "GET",
    });
    const arrayBuffer = await response.arrayBuffer();
    const contentDisposition = response.headers.get("content-disposition") || "";
    const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
    const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : `${projectId}.zip`;
    const buffer = Buffer.from(arrayBuffer);
    const manifest = extractCloneManifest(buffer);

    return {
      fileName,
      buffer,
      manifest,
    };
  }

  async createProject(input: { name: string; slug?: string; description?: string }): Promise<CloudProjectSummary> {
    const response = await this.requestJson<{ project: any }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
    });
    return {
      id: String(response.project.id),
      name: String(response.project.name),
      slug: String(response.project.slug),
      description: typeof response.project.description === "string" ? response.project.description : null,
      updatedAt: typeof response.project.updatedAt === "string" ? response.project.updatedAt : undefined,
    };
  }

  async prepareRelease(
    projectId: string,
    payload: { message?: string; prototypes: ReleasePreparePrototype[] }
  ): Promise<ReleasePrepareResult> {
    return this.requestJson<ReleasePrepareResult>(`/api/projects/${projectId}/releases/prepare`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
  }

  async uploadBlobs(
    releaseId: string,
    files: Array<{ hash: string; content: Buffer; contentType?: string }>
  ): Promise<{ uploaded: string[] }> {
    const formData = new FormData();
    formData.set("releaseId", releaseId);
    for (const file of files) {
      const blob = new Blob([new Uint8Array(file.content)], { type: file.contentType || "application/octet-stream" });
      formData.append("files", blob, file.hash);
    }
    return this.requestJson<{ uploaded: string[] }>("/api/blobs/batch", {
      method: "POST",
      body: formData,
    });
  }

  async commitRelease(projectId: string, releaseId: string, payload: ReleaseCommitPayload): Promise<ReleaseCommitResult> {
    return this.requestJson<ReleaseCommitResult>(`/api/projects/${projectId}/releases/${releaseId}/commit`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
  }

  async getReleaseStatus(projectId: string, releaseId: string): Promise<ReleaseStatusResult> {
    return this.requestJson<ReleaseStatusResult>(`/api/projects/${projectId}/releases/${releaseId}`);
  }

  async ensureValidAuth(): Promise<AuthHostRecord> {
    if (!this.auth) {
      throw new Error("未登录云端服务器，请运行: prdkit auth login");
    }

    if (new Date(this.auth.expiresAt).getTime() > Date.now() + 15_000) {
      return this.auth;
    }

    return this.refreshAuth();
  }

  private async refreshAuth(): Promise<AuthHostRecord> {
    if (!this.auth?.refreshToken) {
      throw new Error("登录状态已失效，请重新运行 prdkit auth login");
    }

    const response = await this.requestJson<{
      accessToken: string;
      refreshToken?: string;
      expiresAt: string;
      user?: AuthenticatedUser;
      scopes?: string[];
    }>(AUTH_BROWSER_REFRESH_PATH, {
      method: "POST",
      body: JSON.stringify({ refreshToken: this.auth.refreshToken }),
      headers: { "Content-Type": "application/json" },
      skipAuthRefresh: true,
    });

    const nextRecord: AuthHostRecord = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken || this.auth.refreshToken,
      expiresAt: response.expiresAt,
      user: response.user || this.auth.user,
      scopes: response.scopes ?? this.auth.scopes,
      lastValidatedAt: new Date().toISOString(),
    };
    await this.setAuth(nextRecord);
    return nextRecord;
  }

  private async setAuth(record: AuthHostRecord): Promise<void> {
    this.auth = record;
    if (this.persistAuth) {
      await this.persistAuth(record);
    }
  }

  private async requestJson<T = JsonObject>(pathname: string, init: RequestInit & { skipAuthRefresh?: boolean } = {}): Promise<T> {
    const response = await this.request(pathname, init);
    if (response.status === 204) {
      return {} as T;
    }
    return response.json() as Promise<T>;
  }

  private async request(pathname: string, init: RequestInit & { skipAuthRefresh?: boolean } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.auth?.accessToken) {
      headers.set("Authorization", `Bearer ${this.auth.accessToken}`);
    }

    const response = await fetch(`${this.host}${pathname}`, {
      ...init,
      headers,
    });

    if (response.status === 401 && !init.skipAuthRefresh && this.auth?.refreshToken) {
      try {
        await this.refreshAuth();
      } catch {
        await this.logout().catch(() => undefined);
        throw new Error("登录状态已过期，请重新运行 prdkit auth login");
      }

      const retryHeaders = new Headers(init.headers);
      if (this.auth?.accessToken) {
        retryHeaders.set("Authorization", `Bearer ${this.auth.accessToken}`);
      }

      const retryResponse = await fetch(`${this.host}${pathname}`, {
        ...init,
        headers: retryHeaders,
      });
      if (retryResponse.ok) {
        return retryResponse;
      }
      throw await buildApiError(retryResponse);
    }

    if (!response.ok) {
      throw await buildApiError(response);
    }

    return response;
  }
}

async function buildApiError(response: Response): Promise<CloudApiError> {
  const data = await response.json().catch(() => ({}));
  const message =
    typeof data.message === "string" ? data.message :
    typeof data.error === "string" ? data.error :
    response.statusText || "请求失败";
  const code = typeof data.code === "string" ? data.code : undefined;
  return new CloudApiError(message, response.status, code);
}

export async function createCloudClient(host: string): Promise<CloudClient> {
  const normalizedHost = normalizeHost(host);
  return new CloudClient({
    host: normalizedHost,
    auth: await getAuthRecord(normalizedHost),
    persistAuth: async (record) => setAuthRecord(normalizedHost, record),
    clearAuth: async () => clearAuthRecord(normalizedHost),
  });
}

function extractCloneManifest(zipBuffer: Buffer): CloudCloneManifest {
  const entries = unzipSync(new Uint8Array(zipBuffer));
  const manifestEntry = entries[".prdkit-clone-manifest.json"];

  if (!manifestEntry) {
    throw new Error("下载产物缺少 .prdkit-clone-manifest.json，无法执行 clone");
  }

  return JSON.parse(strFromU8(manifestEntry)) as CloudCloneManifest;
}

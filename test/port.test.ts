import { describe, it, expect } from 'vitest';
import net from 'net';
import { findAvailablePort, findAvailablePortBlock, isPortAvailable } from '../src/utils/port.js';

describe('findAvailablePort', () => {
  it('应该返回可用端口', async () => {
    const port = await findAvailablePort(7788, 7888);
    expect(port).toBeGreaterThanOrEqual(7788);
    expect(port).toBeLessThanOrEqual(7888);
  });

  it('应该跳过被占用的端口', async () => {
    // 占用第一个端口
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(8800, () => {
        server.removeAllListeners('error');
        resolve();
      });
    });

    try {
      const port = await findAvailablePort(8800, 8900);
      expect(port).toBeGreaterThan(8800);
    } finally {
      server.close();
    }
  });

  it('当所有端口都被占用时应该抛出错误', async () => {
    // 占用一个小范围的端口
    const servers: net.Server[] = [];
    for (let p = 9000; p <= 9002; p++) {
      const server = net.createServer();
      await new Promise<void>((resolve) => {
        server.listen(p, () => resolve());
      });
      servers.push(server);
    }

    try {
      await expect(
        findAvailablePort(9000, 9002)
      ).rejects.toThrow('无法找到可用端口');
    } finally {
      servers.forEach(s => s.close());
    }
  });
});

describe('isPortAvailable', () => {
  it('应该正确识别被占用的端口', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(9100, () => {
        server.removeAllListeners('error');
        resolve();
      });
    });

    try {
      await expect(isPortAvailable(9100)).resolves.toBe(false);
    } finally {
      server.close();
    }
  });
});

describe('findAvailablePortBlock', () => {
  it('应该返回连续可用端口段的起始端口', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(9200, () => {
        server.removeAllListeners('error');
        resolve();
      });
    });

    try {
      const port = await findAvailablePortBlock(9200, 9203, 2);
      expect(port).toBe(9201);
    } finally {
      server.close();
    }
  });

  it('当找不到连续端口段时应该抛出错误', async () => {
    const servers: net.Server[] = [];
    for (const p of [9300, 9302]) {
      const server = net.createServer();
      await new Promise<void>((resolve) => {
        server.listen(p, () => resolve());
      });
      servers.push(server);
    }

    try {
      await expect(
        findAvailablePortBlock(9300, 9302, 2)
      ).rejects.toThrow('无法找到 2 个连续可用端口');
    } finally {
      servers.forEach((server) => server.close());
    }
  });
});

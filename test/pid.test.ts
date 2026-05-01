import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeServerInfo, readServerInfo, removeServerInfo, getServerStatus, isProcessRunning } from '../src/utils/pid.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

describe('PID 管理', () => {
  const testProjectRoot = path.join(process.cwd(), 'test-fixtures', 'pid-test');
  const pidFile = path.join(testProjectRoot, '.prdkit', 'server.pid');

  beforeEach(async () => {
    // 创建测试目录
    await fs.mkdir(testProjectRoot, { recursive: true });
  });

  afterEach(async () => {
    // 清理测试目录
    if (existsSync(testProjectRoot)) {
      await fs.rm(testProjectRoot, { recursive: true, force: true });
    }
  });

  it('应该能写入服务信息', async () => {
    const info = {
      pid: process.pid,
      port: 8080,
      apiPort: 8081,
      mode: 'dev' as const,
      startTime: Date.now(),
      projectRoot: testProjectRoot
    };

    await writeServerInfo(info);

    expect(existsSync(pidFile)).toBe(true);
    const content = await fs.readFile(pidFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.port).toBe(8080);
    expect(parsed.mode).toBe('dev');
  });

  it('应该能读取服务信息', async () => {
    const info = {
      pid: process.pid,
      port: 7788,
      mode: 'prod' as const,
      startTime: Date.now(),
      projectRoot: testProjectRoot
    };

    await writeServerInfo(info);
    const readInfo = await readServerInfo(testProjectRoot);

    expect(readInfo).not.toBeNull();
    expect(readInfo?.pid).toBe(process.pid);
    expect(readInfo?.port).toBe(7788);
    expect(readInfo?.mode).toBe('prod');
  });

  it('应该能删除服务信息', async () => {
    const info = {
      pid: process.pid,
      port: 8080,
      mode: 'dev' as const,
      startTime: Date.now(),
      projectRoot: testProjectRoot
    };

    await writeServerInfo(info);
    expect(existsSync(pidFile)).toBe(true);

    await removeServerInfo(testProjectRoot);
    expect(existsSync(pidFile)).toBe(false);
  });

  it('应该能检测当前进程是否运行', () => {
    // 当前进程应该在运行
    expect(isProcessRunning(process.pid)).toBe(true);

    // 一个不存在的 PID
    expect(isProcessRunning(999999)).toBe(false);
  });

  it('应该能获取服务状态', async () => {
    // 没有服务运行时
    let status = await getServerStatus(testProjectRoot);
    expect(status.running).toBe(false);
    expect(status.info).toBeNull();

    // 写入当前进程信息
    const info = {
      pid: process.pid,
      port: 8080,
      mode: 'dev' as const,
      startTime: Date.now(),
      projectRoot: testProjectRoot
    };
    await writeServerInfo(info);

    // 应该检测到服务运行
    status = await getServerStatus(testProjectRoot);
    expect(status.running).toBe(true);
    expect(status.info?.pid).toBe(process.pid);
  });

  it('应该清理不存在进程的 PID 文件', async () => {
    // 写入一个不存在的进程 PID
    const info = {
      pid: 999999,
      port: 8080,
      mode: 'dev' as const,
      startTime: Date.now(),
      projectRoot: testProjectRoot
    };
    await writeServerInfo(info);
    expect(existsSync(pidFile)).toBe(true);

    // 获取状态时应该清理 PID 文件
    const status = await getServerStatus(testProjectRoot);
    expect(status.running).toBe(false);
    expect(status.info).toBeNull();
    expect(existsSync(pidFile)).toBe(false);
  });
});

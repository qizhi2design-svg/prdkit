import net from 'net';

/**
 * 检查指定端口是否可用
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

/**
 * 在指定范围内查找可用端口
 * @param startPort 起始端口（默认 7788）
 * @param endPort 结束端口（默认 7888）
 * @returns 可用端口号
 * @throws 如果所有端口都被占用
 */
export async function findAvailablePort(
  startPort: number = 7788,
  endPort: number = 7888
): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `无法找到可用端口（范围：${startPort}-${endPort}）。` +
    `请检查是否有过多的服务占用端口。`
  );
}

/**
 * 在指定范围内查找一段连续可用端口
 * @param startPort 起始端口
 * @param endPort 结束端口
 * @param count 需要连续可用的端口数量
 * @returns 连续端口段的起始端口
 * @throws 如果找不到满足条件的连续端口
 */
export async function findAvailablePortBlock(
  startPort: number,
  endPort: number,
  count: number
): Promise<number> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`无效的端口数量：${count}`);
  }

  const lastStartPort = endPort - count + 1;
  for (let port = startPort; port <= lastStartPort; port++) {
    let allAvailable = true;

    for (let offset = 0; offset < count; offset++) {
      if (!(await isPortAvailable(port + offset))) {
        allAvailable = false;
        break;
      }
    }

    if (allAvailable) {
      return port;
    }
  }

  throw new Error(
    `无法找到 ${count} 个连续可用端口（范围：${startPort}-${endPort}）。` +
    `请检查是否有过多的服务占用端口。`
  );
}

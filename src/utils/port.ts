import net from 'net';

/**
 * 检查指定端口是否可用
 */
async function isPortAvailable(port: number): Promise<boolean> {
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

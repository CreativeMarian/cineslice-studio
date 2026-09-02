// 端口占用检测与自动处理
// v1.0
// Windows: 尝试 taskkill 关闭占用进程；失败则端口 +1 重试

import net from 'net';
import { networkInterfaces } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** 检测端口是否被占用 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '0.0.0.0');
  });
}

/** Windows: 通过 netstat 找到占用端口的 PID，然后 taskkill */
async function killProcessOnPortWindows(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const lines = stdout.trim().split('\n').filter(Boolean);
    const pids = new Set<string>();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
    if (pids.size === 0) return false;
    for (const pid of pids) {
      try {
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`[端口管理] 已关闭占用端口 ${port} 的进程 PID=${pid}`);
      } catch {
        // 单个进程关闭失败继续尝试其他
      }
    }
    // 等待端口释放
    await new Promise((r) => setTimeout(r, 800));
    return !(await isPortInUse(port));
  } catch {
    return false;
  }
}

/** macOS/Linux: lsof 找到 PID 并 kill */
async function killProcessOnPortUnix(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    if (pids.length === 0) return false;
    for (const pid of pids) {
      try {
        await execAsync(`kill -9 ${pid}`);
        console.log(`[端口管理] 已关闭占用端口 ${port} 的进程 PID=${pid}`);
      } catch {
        // ignore
      }
    }
    await new Promise((r) => setTimeout(r, 800));
    return !(await isPortInUse(port));
  } catch {
    return false;
  }
}

/** 尝试关闭占用端口的进程 */
async function tryKillPort(port: number): Promise<boolean> {
  if (process.platform === 'win32') {
    return killProcessOnPortWindows(port);
  }
  return killProcessOnPortUnix(port);
}

/**
 * 获取可用端口
 * - 先检测默认端口
 * - 被占用则尝试关闭占用进程
 * - 关闭失败则端口 +1 重试，最多尝试 maxAttempts 个
 */
export async function getAvailablePort(
  defaultPort: number,
  maxAttempts = 10,
): Promise<{ port: number; wasOccupied: boolean; killed: boolean }> {
  let port = defaultPort;
  let wasOccupied = false;
  let killed = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return { port, wasOccupied, killed };
    }

    wasOccupied = true;
    console.log(`[端口管理] 端口 ${port} 已被占用，尝试关闭占用进程...`);

    const killedOk = await tryKillPort(port);
    if (killedOk) {
      killed = true;
      const stillInUse = await isPortInUse(port);
      if (!stillInUse) {
        return { port, wasOccupied, killed };
      }
    }

    console.log(`[端口管理] 无法释放端口 ${port}，尝试端口 ${port + 1}`);
    port += 1;
  }

  // 所有尝试都失败，返回最后一个端口（让应用自己报错）
  console.warn(`[端口管理] 尝试了 ${maxAttempts} 个端口均被占用，使用 ${port}`);
  return { port, wasOccupied, killed };
}

/** 获取本机局域网 IP */
export function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

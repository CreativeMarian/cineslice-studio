import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { networkInterfaces } from 'os';
import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import viteCompression from 'vite-plugin-compression';

const execAsync = promisify(exec);

/** 检测端口是否被占用 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') resolve(true);
      else resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '0.0.0.0');
  });
}

/** Windows: taskkill 关闭占用端口的进程 */
async function killPortWindows(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const pids = new Set<string>();
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try { await execAsync(`taskkill /F /PID ${pid}`); } catch { /* ignore */ }
    }
    await new Promise(r => setTimeout(r, 800));
    return !(await isPortInUse(port));
  } catch {
    return false;
  }
}

/** 获取可用端口：被占用则尝试关闭，关闭不了则 +1 */
async function getAvailablePort(defaultPort: number, maxAttempts = 10): Promise<number> {
  let port = defaultPort;
  for (let i = 0; i < maxAttempts; i++) {
    if (!(await isPortInUse(port))) return port;
    console.log(`[Vite] 端口 ${port} 被占用，尝试释放...`);
    const killed = process.platform === 'win32' ? await killPortWindows(port) : false;
    if (killed && !(await isPortInUse(port))) return port;
    console.log(`[Vite] 端口 ${port} 无法释放，尝试 ${port + 1}`);
    port += 1;
  }
  return port;
}

/** 获取局域网 IP */
function getLocalIP(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return '127.0.0.1';
}

export default defineConfig(async () => {
  // 前端端口检测
  const frontendPort = await getAvailablePort(parseInt(process.env.VITE_PORT || '9090', 10));
  // 后端端口（用于代理），默认 3000，可通过环境变量覆盖
  const backendPort = parseInt(process.env.BACKEND_PORT || '3000', 10);

  const localIP = getLocalIP();

  console.log('========================================');
  console.log('[CineSlice Studio] 前端开发服务器');
  console.log(`[CineSlice Studio] 本地访问: http://localhost:${frontendPort}`);
  console.log(`[CineSlice Studio] 局域网访问: http://${localIP}:${frontendPort}`);
  console.log(`[CineSlice Studio] API 代理: http://127.0.0.1:${backendPort}`);
  console.log('========================================');

  return {
    plugins: [
      react(),
      tailwindcss(),
      viteCompression({ algorithm: 'gzip', ext: '.gz' }),
      viteCompression({ algorithm: 'brotliCompress', ext: '.br' }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: frontendPort,
      strictPort: false, // 允许 Vite 自动找下一个端口（双重保险）
      watch: {
        // 忽略临时文件与审计脚本，避免文件监视器崩溃（EBUSY）
        ignored: ['**/*.agent_infra_tmp*', '**/*.tmp', '**/smoke-*.ts', '**/patch-*.cjs', '**/api-audit.cjs', '**/data-check.cjs'],
      },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
        '/data': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
        '/uploads': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': ['framer-motion', 'lucide-react'],
            'form-vendor': ['zod', 'axios', 'zustand'],
          },
        },
      },
    },
  };
});

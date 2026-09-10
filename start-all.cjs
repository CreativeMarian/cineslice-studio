// 独立守护启动：后端/前端/配音（detached+unref，不随调用会话退出）
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'E:\\Demo\\MOO';
const PY = 'C:\\Users\\Calvin\\AppData\\Local\\Doubao\\User Data\\sandbox_runtime\\bases\\c98c5042338ed152c6f10ecd8591889f\\python\\python.exe';

function launch(name, cmd, args, outLog, errLog) {
  const outFd = fs.openSync(path.join(ROOT, outLog), 'a');
  const errFd = fs.openSync(path.join(ROOT, errLog), 'a');
  const child = spawn(cmd, args, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
  });
  child.unref();
  console.log(`${name} launched pid=${child.pid}`);
}

launch('backend', process.execPath, ['server/dist/index.js'], 'data\\server32.out.log', 'data\\server32.err.log');
launch('frontend', process.execPath, ['node_modules\\vite\\bin\\vite.js', '--host', '0.0.0.0'], 'data\\frontend2.out.log', 'data\\frontend2.err.log');
launch('tts', PY, ['server/scripts/edge_tts_server.py'], 'data\\tts2.out.log', 'data\\tts2.err.log');
console.log('all launched');

const fs = require('fs');
const b = fs.readFileSync('server/src/services/prompts/keyframePrompt.ts', 'utf8');
console.log('head:', JSON.stringify(b.slice(0, 60)));
const i = b.indexOf('frameType');
console.log('area1:', JSON.stringify(b.slice(i - 5, i + 160)));
const j = b.indexOf('这是镜头开始的第一帧');
console.log('area2:', JSON.stringify(b.slice(j - 80, j + 80)));

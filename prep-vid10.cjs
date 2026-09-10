// 批量生成前 N 镜视频（ComfyUI flf2v 首尾帧）
const fs = require('fs');
const shotIds = JSON.parse(fs.readFileSync('E:/Demo/MOO/data/shot10-ids.json', 'utf8'));
const body = {
  provider: 'comfyui',
  modelName: 'minimax-h3-flf2v.json',
  shotIds,
  duration: 5,
  ratio: '16:9',
  resolution: '720p',
  stream: true,
};
fs.writeFileSync('E:/Demo/MOO/data/tmp-vid10.json', JSON.stringify(body));
console.log('video batch body ready:', shotIds.length, 'shots');

async function main() {
  const body = {
    provider: 'comfyui',
    modelName: 'minimax-h3-video.json',
    keyframeId: 'kf_67fb2242e0a53356',
    duration: 5,
    ratio: '16:9',
    resolution: '720p',
    motionPrompt: '刘桂芬双手交握低头沉默，缓缓抬头看向镜头，嘴唇微动，眼神从沉重转为坚定。',
  };
  try {
    const r = await fetch('http://127.0.0.1:3000/api/shots/shot_6918594b490dd23a/video/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    console.log('status', r.status, JSON.stringify(j).substring(0, 400));
  } catch (e) { console.log('fail', e.message); }
}
main();

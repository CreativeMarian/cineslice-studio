async function st(vid) {
  const r = await fetch('http://127.0.0.1:3000/api/videos/' + vid + '/status');
  return (await r.json()).data || {};
}
async function main() {
  const vid = 'vid_463e9b3542f11cd8';
  const t0 = Date.now();
  while (true) {
    const d = await st(vid);
    console.log(new Date().toISOString().slice(11, 19), d.status, d.video_url ? d.video_url.slice(0, 70) : '', d.error_message ? 'ERR:' + d.error_message.slice(0, 150) : '');
    if (d.status === 'completed' || d.status === 'failed') break;
    if (Date.now() - t0 > 1800000) { console.log('TIMEOUT'); break; }
    await new Promise(r2 => setTimeout(r2, 20000));
  }
}
main();

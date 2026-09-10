const fs = require('fs');
const p = 'E:/Demo/MOO/server/src/services/episodeProductionService.ts';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
if (crlf) s = s.replace(/\r\n/g, '\n');

const anchor = `      const imgResult = await aiProxy.generateImage({
        db, userId, projectId: episode.project_id,
        provider, modelName, prompt: finalPrompt, negativePrompt: finalNegativePrompt,
        count: 1, size: '2560x1440',`;
if (!s.includes(anchor)) throw new Error('anchor not found');

const insert = `      // Pollinations FLUX 对英文提示词理解远优于中文：先经 deepseek 翻译成英文
      let effectivePrompt = finalPrompt;
      if (provider === 'pollinations') {
        try {
          const trans = await aiProxy.generateText({
            db, userId,
            provider: 'deepseek', modelName: 'deepseek-chat',
            prompt: 'You are a professional prompt translator for AI image generation models. Translate the following Chinese image prompt into fluent, detailed English. Keep EVERY visual detail: characters, clothing, props, scene, background, action, body pose, camera angle, lighting, color tone, mood and art style. For Chinese-style elements (costume, architecture, props) use clear English descriptions instead of raw pinyin. Output ONLY the English translation with no explanation, no quotes.\\n\\n' + finalPrompt,
            temperature: 0.3,
            maxTokens: 900,
          });
          const t = (trans.content || '').trim();
          if (t.length > 20) effectivePrompt = t;
        } catch (transErr) {
          console.warn('[Keyframe] FLUX提示词翻译失败，使用中文原词:', (transErr as Error).message);
        }
      }

      const imgResult = await aiProxy.generateImage({
        db, userId, projectId: episode.project_id,
        provider, modelName, prompt: effectivePrompt, negativePrompt: finalNegativePrompt,
        count: 1, size: '2560x1440',`;
s = s.replace(anchor, insert);

// 入库也存 effectivePrompt
const p2 = `        frame_type: frameType,
        prompt: finalPrompt,`;
if (!s.includes(p2)) throw new Error('p2 not found');
s = s.replace(p2, `        frame_type: frameType,
        prompt: effectivePrompt,`);

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('OK - episodeProductionService patched. effectivePrompt occurrences:', s.split('effectivePrompt').length - 1);

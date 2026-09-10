const db = require('better-sqlite3')('data/cineslice-studio.db');
const { aiProxy } = require('./server/dist/services/aiProxy');
const models = [
  { provider: 'deepseek', modelName: 'deepseek-chat' },
  { provider: 'qwen', modelName: 'qwen-turbo' },
  { provider: 'custom-openai', modelName: 'agnes-2.5-flash' },
  { provider: 'zhipu', modelName: 'glm-4-flash' },
];
(async () => {
  for (const m of models) {
    try {
      const t0 = Date.now();
      const r = await aiProxy.generateText({
        db,
        userId: 'local_user',
        provider: m.provider,
        modelName: m.modelName,
        prompt: '只回复两个字：正常',
        systemPrompt: '你是测试助手',
        maxTokens: 50,
      });
      console.log(`OK ${m.provider}/${m.modelName} ${Date.now() - t0}ms =>`, (r.content || '').slice(0, 60));
    } catch (e) {
      console.log(`FAIL ${m.provider}/${m.modelName} =>`, (e.message || e).toString().slice(0, 200));
    }
  }
})();

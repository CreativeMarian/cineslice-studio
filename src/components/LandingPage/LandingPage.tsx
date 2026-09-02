import { useEffect, useRef } from 'react';

const styles = [
  { name: '动漫风格', desc: '日系动漫，赛璐璐着色，清晰线条', tags: ['二次元', '漫剧'], color: 'from-pink-500/20 to-purple-500/20', iconColor: 'text-pink-400' },
  { name: '国风风格', desc: '中国风，水墨渲染，传统配色', tags: ['古风', '仙侠'], color: 'from-red-500/20 to-amber-500/20', iconColor: 'text-red-400' },
  { name: '现代风格', desc: '现代都市，写实渲染，时尚色调', tags: ['都市', '职场'], color: 'from-blue-500/20 to-cyan-500/20', iconColor: 'text-blue-400' },
  { name: '科幻风格', desc: '赛博朋克，霓虹灯光，未来感', tags: ['科幻', '赛博朋克'], color: 'from-purple-500/20 to-indigo-500/20', iconColor: 'text-purple-400' },
  { name: '电影级写实', desc: 'cinematic，高细节，电影感光影', tags: ['剧情片', '推荐'], color: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-400', featured: true },
];

const workflow = [
  { step: 1, title: '小说上传与解析', desc: '上传 .txt/.md 小说，自动识别章节' },
  { step: 2, title: '剧集拆分与剧本', desc: 'AI 把小说改编成标准剧本' },
  { step: 3, title: '角色提取与概念图', desc: '自动提取角色，生成角色概念图' },
  { step: 4, title: '场景提取与参考图', desc: '自动提取场景，生成场景参考图' },
  { step: 5, title: '智能分镜生成', desc: 'AI 生成专业分镜表' },
  { step: 6, title: '关键帧批量生成', desc: '为每个镜头生成首帧' },
  { step: 7, title: 'AI 配音生成', desc: '为对话生成配音，多角色音色' },
  { step: 8, title: '视频片段生成', desc: '首帧驱动的视频生成' },
  { step: 9, title: '最终合成导出', desc: '拼接所有视频，导出 MP4', featured: true },
];

const models = [
  { category: '文本模型', desc: '用来写剧本、分镜', items: ['OpenAI GPT-4o', 'DeepSeek', '字节豆包', '硅基流动', '+ 6 家更多'], color: 'from-blue-500/20 to-cyan-500/20', iconColor: 'text-blue-400' },
  { category: '图像模型', desc: '用来画角色图、关键帧', items: ['字节 Seedream', 'DALL-E 3', 'Stable Diffusion', 'Midjourney', '+ 4 家更多'], color: 'from-pink-500/20 to-rose-500/20', iconColor: 'text-pink-400' },
  { category: '视频模型', desc: '用来让画面动起来', items: ['Seedance 2.5', 'Seedance 1.0 Pro', 'Seedance 1.0 Lite'], color: 'from-purple-500/20 to-indigo-500/20', iconColor: 'text-purple-400' },
  { category: '音频模型', desc: '用来给对话配音', items: ['字节豆包 TTS', 'OpenAI TTS', 'ElevenLabs', 'Azure TTS'], color: 'from-green-500/20 to-emerald-500/20', iconColor: 'text-green-400' },
];

const faqs = [
  { q: '用这个工具需要花钱吗？', a: 'CineSlice Studio 本身免费，但你需要用自己的 AI 模型 API Key。调用 AI 模型会产生费用，费用直接付给模型厂商，我们不赚差价。' },
  { q: '生成一段视频大概要多久？', a: '取决于视频长度和镜头数量：短篇约 15-30 分钟，中篇约 30-60 分钟，长篇约 60-120 分钟。你可以用全自动模式，让它自己跑。' },
  { q: '人物在不同镜头里长得一样吗？', a: 'CineSlice Studio 做了很多工作保障人物一致性（角色概念图 + 参考图传递 + 外貌描述注入 + 统一风格）。大部分情况下基本一样，偶尔可能有细微差异。' },
  { q: '我不会写提示词，能用吗？', a: '完全可以！系统会根据剧本分析结果自动优化提示词。你只要上传小说，剩下的交给 AI。' },
  { q: '我的小说数据安全吗？', a: 'CineSlice Studio 是本地部署工具，你的小说和生成的所有内容都保存在你自己的电脑上，不会上传到我们的服务器。' },
  { q: '生成的视频可以商用吗？', a: '可以。你生成的视频可以用于商业用途。但请注意，你使用的 AI 模型可能有商用限制，建议查看对应模型厂商的服务条款。' },
];

export function LandingPage() {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0');
            entry.target.classList.remove('opacity-0', 'translate-y-8');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.reveal').forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-gray-200 overflow-x-hidden">
      {/* 粒子背景 */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-amber-500/30"
            style={{
              left: `${(i * 7) % 100}%`,
              top: `${(i * 13) % 100}%`,
              animation: `float ${6 + (i % 4)}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
              boxShadow: '0 0 8px rgba(249,115,22,0.5)',
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .gradient-text { background: linear-gradient(135deg,#F97316,#FDBA74,#F97316); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; animation:shimmer 3s linear infinite; }
        .glass { background: rgba(26,29,38,0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
        .reveal { transition: all 0.8s cubic-bezier(0.16,1,0.3,1); }
      `}</style>

      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-gray-900 text-lg">M</div>
            <span className="font-bold text-xl text-white">CineSlice Studio</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo('features')} className="text-gray-300 hover:text-amber-400 transition-colors">功能</button>
            <button onClick={() => scrollTo('workflow')} className="text-gray-300 hover:text-amber-400 transition-colors">流程</button>
            <button onClick={() => scrollTo('styles')} className="text-gray-300 hover:text-amber-400 transition-colors">风格</button>
            <button onClick={() => scrollTo('models')} className="text-gray-300 hover:text-amber-400 transition-colors">模型</button>
            <button onClick={() => scrollTo('faq')} className="text-gray-300 hover:text-amber-400 transition-colors">常见问题</button>
          </div>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-gray-300 hover:text-white transition-colors">登录</a>
            <a href="/login" className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-gray-900 font-semibold rounded-xl hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20">
              免费开始
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20"
        style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(249,115,22,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(251,146,60,0.1) 0%, transparent 50%)' }}>
        <div className="max-w-7xl mx-auto px-6 py-20 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-sm text-gray-300">AI 驱动的全流程影视创作工具</span>
          </div>
          <h1 className="font-bold text-5xl md:text-7xl lg:text-8xl text-white mb-6 leading-tight">
            用 AI 把小说<br />
            <span className="gradient-text">变成视频</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-12 leading-relaxed">
            上传一篇小说，AI 自动完成剧本改编、角色设计、场景绘制、分镜生成、关键帧、配音、视频合成，
            <span className="text-amber-400"> 9 步全流程自动化</span>，你只需要点几下鼠标。
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a href="/login" className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-gray-900 font-bold text-lg rounded-2xl hover:from-amber-400 hover:to-amber-500 transition-all shadow-xl shadow-amber-500/30 hover:scale-105">
              立即开始创作 →
            </a>
            <button onClick={() => scrollTo('workflow')} className="w-full sm:w-auto px-8 py-4 glass text-white font-semibold text-lg rounded-2xl hover:bg-white/10 transition-all">
              查看工作流程
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { num: '9', label: '步全流程自动化' },
              { num: '20+', label: 'AI 模型支持' },
              { num: '5', label: '种风格预设' },
              { num: '7', label: '维度剧本分析' },
            ].map((s, i) => (
              <div key={i} className="glass rounded-2xl p-6">
                <div className="font-bold text-4xl text-amber-400 mb-2">{s.num}</div>
                <div className="text-gray-400 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 三大特色 */}
      <section id="features" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 reveal opacity-0 translate-y-8">
            <h2 className="font-bold text-4xl md:text-5xl text-white mb-4">三大核心特色</h2>
            <p className="text-xl text-gray-400">不仅仅是 AI 生成，更是专业的影视创作工具</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: '多种风格预设', desc: '内置 5 种专业风格，一键应用全片。动漫、国风、现代、科幻、电影级写实，选一个就够了。', tags: ['动漫', '国风', '现代', '科幻', '电影级'], icon: '🎨' },
              { title: '多模型自由选择', desc: '支持 20+ 家 AI 模型，文本、图像、视频、音频都有多家可选。你用自己的 API Key，费用直接付给厂商。', tags: ['GPT-4o', 'DeepSeek', '豆包', 'Seedream', 'Seedance'], icon: '🤖' },
              { title: 'AI 个性化推荐', desc: '不只是执行命令，AI 会智能推荐。风格推荐、提示词推荐、音色推荐、时长推荐，越用越懂你。', tags: ['风格推荐', '提示词', '音色', '时长', '模型'], icon: '✨' },
            ].map((f, i) => (
              <div key={i} className="glass rounded-3xl p-8 reveal opacity-0 translate-y-8 hover:translate-y-[-8px] transition-all duration-300" style={{ transitionDelay: `${i * 0.1}s` }}>
                <div className="text-4xl mb-6">{f.icon}</div>
                <h3 className="font-bold text-2xl text-white mb-4">{f.title}</h3>
                <p className="text-gray-400 mb-6 leading-relaxed">{f.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {f.tags.map((t, j) => (
                    <span key={j} className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-sm">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9步工作流程 */}
      <section id="workflow" className="py-24 relative bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 reveal opacity-0 translate-y-8">
            <h2 className="font-bold text-4xl md:text-5xl text-white mb-4">9 步全流程自动化</h2>
            <p className="text-xl text-gray-400">从小说到视频，每一步都有 AI 帮你完成</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {workflow.map((w, i) => (
              <div key={i} className={`glass rounded-2xl p-6 reveal opacity-0 translate-y-8 hover:translate-y-[-4px] transition-all duration-300 ${w.featured ? 'border-2 border-amber-500/30' : ''}`} style={{ transitionDelay: `${i * 0.05}s` }}>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-gray-900 text-xl flex-shrink-0 ${w.featured ? 'animate-pulse' : ''}`}>{w.step}</div>
                  <div>
                    <h4 className={`font-bold text-lg mb-2 ${w.featured ? 'text-amber-400' : 'text-white'}`}>{w.title}</h4>
                    <p className="text-gray-400 text-sm leading-relaxed">{w.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center reveal opacity-0 translate-y-8">
            <div className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-500/20">
              <span className="text-2xl">⚡</span>
              <span className="text-gray-300">太麻烦？用<span className="text-amber-400 font-semibold">「一键全自动」</span>模式，上传小说后全部自动完成！</span>
            </div>
          </div>
        </div>
      </section>

      {/* 风格预设 */}
      <section id="styles" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 reveal opacity-0 translate-y-8">
            <h2 className="font-bold text-4xl md:text-5xl text-white mb-4">5 种专业风格预设</h2>
            <p className="text-xl text-gray-400">选一个风格，全片自动统一，不用自己调参数</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {styles.map((s, i) => (
              <div key={i} className={`glass rounded-3xl overflow-hidden reveal opacity-0 translate-y-8 hover:translate-y-[-8px] transition-all duration-300 ${s.featured ? 'border-2 border-amber-500/30' : ''}`} style={{ transitionDelay: `${i * 0.05}s` }}>
                <div className={`h-40 bg-gradient-to-br ${s.color} flex items-center justify-center relative`}>
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
                  <span className={`text-5xl ${s.iconColor} relative z-10`}>🎬</span>
                </div>
                <div className="p-6">
                  <h4 className={`font-bold text-xl mb-2 ${s.featured ? 'text-amber-400' : 'text-white'}`}>{s.name}</h4>
                  <p className="text-gray-400 text-sm mb-4">{s.desc}</p>
                  <div className="flex flex-wrap gap-1">
                    {s.tags.map((t, j) => (
                      <span key={j} className={`px-2 py-0.5 rounded text-xs ${s.featured ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-500/10 text-gray-400'}`}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 多模型支持 */}
      <section id="models" className="py-24 relative bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 reveal opacity-0 translate-y-8">
            <h2 className="font-bold text-4xl md:text-5xl text-white mb-4">20+ AI 模型自由选择</h2>
            <p className="text-xl text-gray-400">文本、图像、视频、音频，每类都有多家可选</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {models.map((m, i) => (
              <div key={i} className="glass rounded-3xl p-8 reveal opacity-0 translate-y-8 hover:translate-y-[-8px] transition-all duration-300" style={{ transitionDelay: `${i * 0.05}s` }}>
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${m.color} flex items-center justify-center mb-6`}>
                  <span className={`text-2xl ${m.iconColor}`}>📦</span>
                </div>
                <h4 className="font-bold text-xl text-white mb-4">{m.category}</h4>
                <p className="text-gray-400 text-sm mb-4">{m.desc}</p>
                <div className="space-y-2">
                  {m.items.map((item, j) => (
                    <div key={j} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{item}</span>
                      {!item.startsWith('+') && <span className="text-green-400">✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 relative">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16 reveal opacity-0 translate-y-8">
            <h2 className="font-bold text-4xl md:text-5xl text-white mb-4">常见问题</h2>
            <p className="text-xl text-gray-400">你可能想知道的</p>
          </div>
          <div className="space-y-4">
            {faqs.map((f, i) => (
              <div key={i} className="glass rounded-2xl p-6 reveal opacity-0 translate-y-8" style={{ transitionDelay: `${i * 0.05}s` }}>
                <h4 className="font-bold text-lg text-white mb-3 flex items-center gap-2">
                  <span className="text-amber-400">Q:</span> {f.q}
                </h4>
                <p className="text-gray-400 leading-relaxed pl-6">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="glass rounded-3xl p-12 md:p-16 relative overflow-hidden reveal opacity-0 translate-y-8">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-amber-600/10"></div>
            <div className="relative z-10">
              <h2 className="font-bold text-4xl md:text-5xl text-white mb-6">
                现在就开始你的<br /><span className="gradient-text">AI 影视创作之旅</span>
              </h2>
              <p className="text-xl text-gray-400 mb-10">
                上传你的第一篇小说，让 AI 帮你变成视频。
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href="/login" className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-gray-900 font-bold text-lg rounded-2xl hover:from-amber-400 hover:to-amber-500 transition-all shadow-xl shadow-amber-500/30 hover:scale-105">
                  免费开始创作 →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-gray-900 text-lg">M</div>
              <span className="font-bold text-xl text-white">CineSlice Studio</span>
            </div>
            <p className="text-gray-500 text-sm">© 2026 CineSlice Studio. 用 AI 把小说变成视频。</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

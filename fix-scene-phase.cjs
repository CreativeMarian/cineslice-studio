const fs = require('fs');
const file = 'src/components/StageScript/SceneBreakdown.tsx';
const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
const out = [];
let inShotList = false;
let listStarted = false;

const PHASE_META = [
  { name: '开场引入', desc: '建立场景与人物，抛出钩子', color: 'from-indigo-500/80 to-blue-500/80', dot: 'bg-indigo-400' },
  { name: '矛盾升级', desc: '冲突推进，矛盾逐步激化', color: 'from-blue-500/80 to-violet-500/80', dot: 'bg-blue-400' },
  { name: '高潮爆发', desc: '核心冲突顶点，情绪最高点', color: 'from-violet-500/80 to-fuchsia-500/80', dot: 'bg-violet-400' },
  { name: '收束悬念', desc: '情绪回落，埋下下一集钩子', color: 'from-fuchsia-500/80 to-cyan-500/80', dot: 'bg-fuchsia-400' },
];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // ============ 1. 在列表容器开始处插入阶段分组逻辑 ============
  // 找到 "        <div className="space-y-3" ref={listRef}>" 这一行
  if (!listStarted && line.includes('space-y-3" ref={listRef}')) {
    out.push(line);
    // 插入阶段分组计算 + 阶段遍历
    out.push('          {/* 按阶段（1-4）分组展示 */}');
    out.push('          {(() => {');
    out.push('            const PHASE_META = [');
    out.push('              { name: \'开场引入\', desc: \'建立场景与人物，抛出钩子\', grad: \'from-indigo-500/15 to-blue-500/15\', chip: \'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300\', dot: \'bg-indigo-400\' },');
    out.push('              { name: \'矛盾升级\', desc: \'冲突推进，矛盾逐步激化\', grad: \'from-blue-500/15 to-violet-500/15\', chip: \'bg-blue-500/15 text-blue-600 dark:text-blue-300\', dot: \'bg-blue-400\' },');
    out.push('              { name: \'高潮爆发\', desc: \'核心冲突顶点，情绪最高点\', grad: \'from-violet-500/15 to-fuchsia-500/15\', chip: \'bg-violet-500/15 text-violet-600 dark:text-violet-300\', dot: \'bg-violet-400\' },');
    out.push('              { name: \'收束悬念\', desc: \'情绪回落，埋下下一集钩子\', grad: \'from-fuchsia-500/15 to-cyan-500/15\', chip: \'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300\', dot: \'bg-fuchsia-400\' },');
    out.push('            ];');
    out.push('            // 计算每只镜头的阶段（shot.phase 缺失时按序号均分4段）');
    out.push('            const phaseOf = (s: Shot, idx: number) => {');
    out.push('              if (s.phase) return s.phase;');
    out.push('              return Math.min(4, Math.max(1, Math.floor((idx / Math.max(1, shots.length)) * 4) + 1));');
    out.push('            };');
    out.push('            const grouped = [1, 2, 3, 4].map((p) => ({');
    out.push('              phase: p,');
    out.push('              meta: PHASE_META[p - 1],');
    out.push('              shots: shots.map((s, idx) => ({ shot: s, idx })).filter(({ shot, idx }) => phaseOf(shot, idx) === p),');
    out.push('            })).filter((g) => g.shots.length > 0);');
    out.push('            return grouped.map((group) => {');
    out.push('              const phaseTotal = group.shots.reduce((sum, { shot }) => sum + shot.duration_seconds, 0);');
    out.push('              return (');
    out.push('                <div key={`phase-${group.phase}`} className="space-y-3">');
    out.push('                  {/* 阶段标题栏 */}');
    out.push('                  <div className={`relative rounded-2xl border border-[var(--border)] bg-gradient-to-r ${group.meta.grad} px-4 py-3 flex items-center gap-3 overflow-hidden`}>');
    out.push('                    <div className={`w-9 h-9 rounded-xl ${group.meta.chip} flex items-center justify-center font-bold text-sm flex-shrink-0`}>P{group.phase}</div>');
    out.push('                    <div className="flex-1 min-w-0">');
    out.push('                      <div className="flex items-center gap-2 flex-wrap">');
    out.push('                        <span className="font-semibold text-sm text-[var(--ink-1)]">{group.meta.name}</span>');
    out.push('                        <span className="text-[11px] text-[var(--ink-3)]">{group.meta.desc}</span>');
    out.push('                      </div>');
    out.push('                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--ink-3)]">');
    out.push('                        <span>{group.shots.length} 镜</span>');
    out.push('                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{phaseTotal}s</span>');
    out.push('                        <span>阶段视频：合成后独立成段，4 段拼接为完整一集</span>');
    out.push('                      </div>');
    out.push('                    </div>');
    out.push('                  </div>');
    out.push('                  {group.shots.map(({ shot }: { shot: Shot }) => {');
    listStarted = true;
    inShotList = true;
    continue;
  }

  // ============ 2. 在镜头卡片的场景 Badge 前加阶段 Badge ============
  if (inShotList && line.includes('{sceneName && (')) {
    out.push('                      {shot.phase && (');
    out.push('                        <Badge variant="default" className={`flex items-center gap-1 ${PHASE_META[(shot.phase || 1) - 1]?.chip || \'\'}`}>');
    out.push('                          <span className={`w-1.5 h-1.5 rounded-full ${PHASE_META[(shot.phase || 1) - 1]?.dot || \'bg-gray-400\'}`} />');
    out.push('                          阶段{shot.phase}{shot.phase_name ? ` · ${shot.phase_name}` : \'\'}');
    out.push('                        </Badge>');
    out.push('                      )}');
    out.push(line);
    continue;
  }

  // ============ 3. 收尾：找到原始 "        </div>\n      ) : (" 结束列表，插入阶段分组闭包 ============
  // 原始结构： `      ) : (\n        <div className="space-y-3" ref={listRef}>\n          {shots.map(...)}...\n        </div>`
  // 我们已将 `{shots.map((shot: Shot) => {` 替换为阶段遍历。现在需要找到原始 map 的结束位置。
  // 原始 map 闭包：在 "          ))}\n        </div>" 附近。我们改用标记法：找到唯一的位置——详情面板结束后 `</Card>\n          ))}\n        </div>`
  if (inShotList && line.includes('))}') && line.includes('</Card>')) {
    // 这是原 map 的结束行 "          ))}"，替换为阶段遍历闭包
    out.push('                    })');
    out.push('                  </div>');
    out.push('                );');
    out.push('              });');
    out.push('            });');
    out.push('          })()}');
    inShotList = false;
    continue;
  }

  out.push(line);
}

fs.writeFileSync(file, out.join('\n'), 'utf-8');
console.log('SceneBreakdown 阶段分组已注入');
const check = fs.readFileSync(file, 'utf-8');
console.log('含 PHASE_META:', check.includes('PHASE_META'));
console.log('含 grouped:', check.includes('const grouped ='));
console.log('含 阶段视频：合成后独立成段:', check.includes('阶段视频：合成后独立成段'));

import { parseNovel } from '../server/src/services/novelParser';
import * as fs from 'fs';

const content = fs.readFileSync('C:\\Users\\Calvin\\Desktop\\逆道善念.txt', 'utf-8');
const chapters = parseNovel(content);

console.log('\n===== 解析结果 =====');
console.log(`总章节数: ${chapters.length}`);
console.log('\n章节列表:');
for (const c of chapters) {
  const ep = c.episodeNumber ? `[第${c.episodeNumber}集]` : '[序言]';
  console.log(`  行${c.lineNumber} ${ep} ${c.title} (${c.wordCount}字)`);
}

const episodeNums = chapters.map(c => c.episodeNumber).filter(n => n !== null) as number[];
console.log(`\n识别到的集数: ${episodeNums.join(', ')}`);
console.log(`最大集数: ${Math.max(...episodeNums)}`);

const missing: number[] = [];
for (let i = 1; i <= 30; i++) {
  if (!episodeNums.includes(i)) missing.push(i);
}
console.log(`缺失集数: ${missing.length > 0 ? missing.join(', ') : '无（全部识别）'}`);

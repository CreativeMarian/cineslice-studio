// 种子数据脚本
// v1.0 - 创建示例项目和演示数据

import { loadEnv } from '../config/env';
import { initSQLite, runMigrations } from '../config/sqliteDatabase';
import { ensureLocalUser, ProjectDAO, NovelChapterDAO, UserPreferenceDAO } from '../models';
import path from 'path';

async function main() {
  const config = loadEnv();
  if (config.dbType !== 'sqlite') {
    console.log('种子数据仅支持 SQLite 模式');
    process.exit(0);
  }

  const db = initSQLite(config.dbPath);
  const migrationsDir = path.resolve(__dirname, '../migrations');
  runMigrations(db, migrationsDir);

  // 确保本地用户
  ensureLocalUser(db);
  UserPreferenceDAO.getOrCreate(db, 'local_user');

  const userId = 'local_user';

  // 检查是否已有项目
  const existing = ProjectDAO.listByUser(db, userId, 1, 1);
  if (existing.total > 0) {
    console.log('已有项目数据，跳过种子数据创建');
    process.exit(0);
  }

  // 创建示例项目
  const project = ProjectDAO.create(db, {
    user_id: userId,
    title: '示例项目：星际旅人',
    description: '一个关于太空探险家的科幻短篇故事，用于演示 CineSlice Studio 的全流程功能。',
  });

  // 创建示例章节
  const sampleChapters = [
    {
      chapter_number: 1,
      title: '第一章 启程',
      content: `公元2387年，人类已经将足迹延伸到了银河系的边缘。

林晓站在"曙光号"飞船的舷窗前，望着窗外无尽的星海。这是她第一次独立执行深空探索任务。

"舰长，跃迁引擎已就绪。"副舰长陈默的声音从通讯器中传来。

林晓深吸一口气，按下了通讯按钮："全体船员注意，十分钟后进入跃迁状态。目标：开普勒-442星系。"

飞船缓缓驶离空间站，引擎的轰鸣声逐渐增强。在一片蓝白色的光芒中，曙光号消失在了太阳系的边缘。`,
    },
    {
      chapter_number: 2,
      title: '第二章 未知信号',
      content: `跃迁结束后，曙光号出现在了一片陌生的星域。

"舰长，我们检测到一个异常信号。"通讯员小王紧张地报告，"信号来源不明，但频率规律显示这不是自然现象。"

林晓走到控制台前，看着屏幕上跳动的波形。信号以一种奇特的节奏重复着，像是某种编码。

"分析信号内容。"林晓命令道。

几分钟后，结果出来了。小王震惊地抬起头："舰长，这...这是一段坐标。指向星系边缘的一颗小行星。"

"改变航向，"林晓果断地说，"我们去看看。"`,
    },
    {
      chapter_number: 3,
      title: '第三章 遗迹',
      content: `曙光号抵达了那颗小行星。

在小行星的表面，船员们发现了一座巨大的金属结构。它半埋在岩石中，表面刻满了未知的符文。

林晓带领探索队登陆。当她的手触碰到那冰冷的金属时，符文突然亮了起来。

一道全息影像投射在空中，显示出一个类人生物的形象。它用一种古老而优美的语言说着什么，同时画面中展示了一个辉煌的文明。

"这是...先驱者的遗迹。"陈默喃喃道。

林晓看着影像中那颗美丽的蓝色星球，心中涌起一种莫名的感动。她知道，这次发现将改变人类对宇宙的认知。`,
    },
  ];

  for (const ch of sampleChapters) {
    NovelChapterDAO.create(db, {
      user_id: userId,
      project_id: project.id,
      chapter_number: ch.chapter_number,
      title: ch.title,
      content: ch.content,
      source_file: 'sample.txt',
    });
  }

  console.log(`种子数据创建完成！`);
  console.log(`项目 ID: ${project.id}`);
  console.log(`章节数: ${sampleChapters.length}`);
  console.log(`启动服务后访问 http://localhost:${config.port}/api/health 验证`);

  process.exit(0);
}

main().catch(err => {
  console.error('种子数据创建失败:', err);
  process.exit(1);
});

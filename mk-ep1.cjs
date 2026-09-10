const db = require('better-sqlite3')('data/cineslice-studio.db');
const { NovelEpisodeDAO } = require('./server/dist/models');
const ch = db.prepare("SELECT * FROM novel_chapters WHERE id='chap_539474d6d01748b6'").get();
const ep = NovelEpisodeDAO.create(db, {
  user_id: 'local_user',
  project_id: 'proj_809ed06d710f86c4',
  episode_number: 1,
  title: ch.title,
  script_content: ch.content,
});
console.log('episode id:', ep.id, 'words:', ep.word_count);

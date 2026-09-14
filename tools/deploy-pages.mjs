// GitHub Pages 배포: dist/를 gh-pages 브랜치에 올린다
//   npm run build && node tools/deploy-pages.mjs "메시지"
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const msg = process.argv[2] ?? 'Deploy demo';
const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
if (!existsSync('dist/index.html')) throw new Error('dist가 없어요. 먼저 npm run build');

const dir = mkdtempSync(path.join(tmpdir(), 'lumina-pages-'));
git(['fetch', 'origin', 'gh-pages']);
git(['worktree', 'add', '--force', dir, 'origin/gh-pages']);
try {
  for (const f of readdirSync(dir)) if (f !== '.git') rmSync(path.join(dir, f), { recursive: true, force: true });
  cpSync('dist', dir, { recursive: true });
  writeFileSync(path.join(dir, '.nojekyll'), '');
  git(['add', '-A'], dir);
  git(['commit', '-m', msg], dir);
  git(['push', 'origin', 'HEAD:gh-pages'], dir);
  console.log('gh-pages 배포 완료');
} finally {
  git(['worktree', 'remove', '--force', dir]);
}

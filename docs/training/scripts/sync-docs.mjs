#!/usr/bin/env node
/**
 * Copies all docs/training/**.md and docs/training/images/** to
 * packages/web/public/docs/ so the in-app HelpCenter can fetch them.
 *
 * Also generates docs/manifest.json listing every doc so the help center
 * can render the navigation sidebar without hardcoding filenames.
 *
 * Run automatically by `pnpm build` (see prebuild script in
 * packages/web/package.json). Idempotent — safe to run repeatedly.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');                                  // docs/training/
const DST = path.resolve(__dirname, '../../../packages/web/public/docs');   // packages/web/public/docs/

async function copyTree(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      // skip the scripts folder and dist
      if (entry.name === 'scripts' || entry.name === 'dist' || entry.name === 'node_modules') continue;
      await copyTree(srcPath, dstPath);
    } else if (
      entry.name.endsWith('.md') ||
      entry.name.endsWith('.png') ||
      entry.name.endsWith('.jpg') ||
      entry.name.endsWith('.svg') ||
      entry.name.endsWith('.gif')
    ) {
      await fs.copyFile(srcPath, dstPath);
    }
  }
}

async function listMdEntries(subdir) {
  const dir = path.join(SRC, subdir);
  try {
    const files = await fs.readdir(dir);
    const entries = [];
    for (const f of files.sort()) {
      if (!f.endsWith('.md')) continue;
      const raw = await fs.readFile(path.join(dir, f), 'utf8');
      // Title = first H1 line, or filename if no H1
      const m = raw.match(/^#\s+(.+?)$/m);
      const title = m ? m[1].trim() : f.replace(/\.md$/, '');
      const slug = f.replace(/\.md$/, '');
      entries.push({
        slug,
        title,
        path: `/docs/${subdir}/${f}`,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

async function main() {
  console.log(`[sync-docs] ${SRC} -> ${DST}`);
  await fs.rm(DST, { recursive: true, force: true });
  await copyTree(SRC, DST);

  const manifest = {
    generatedAt: new Date().toISOString(),
    index: { path: '/docs/README.md' },
    personas: await listMdEntries('personas'),
    features: await listMdEntries('features'),
    workflows: await listMdEntries('workflows'),
  };
  await fs.writeFile(path.join(DST, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    `[sync-docs] manifest written: ${manifest.personas.length} personas, ${manifest.features.length} features, ${manifest.workflows.length} workflows`,
  );
}

main().catch((err) => {
  console.error('[sync-docs] failed:', err);
  process.exit(1);
});

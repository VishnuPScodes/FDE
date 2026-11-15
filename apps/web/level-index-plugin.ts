import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import type { Plugin } from 'vite';

// I23: build-time level index. Parses every content level.yaml once at build
// (and on dev-server start) so the Learn/Dashboard pages need no runtime YAML parsing.
export function levelIndexPlugin(): Plugin {
  const virtualId = 'virtual:level-index';
  const resolved = '\0' + virtualId;
  const root = path.resolve(__dirname, '../../content');
  function walk(dir: string, out: string[]) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.name === 'level.yaml' && full.includes(`${path.sep}levels${path.sep}`)) out.push(full);
    }
  }
  return {
    name: 'fde-level-index',
    resolveId(id) {
      return id === virtualId ? resolved : null;
    },
    load(id) {
      if (id !== resolved) return null;
      const files: string[] = [];
      walk(root, files);
      files.sort();
      const levels = files.map((f) => {
        this.addWatchFile(f);
        return yaml.load(fs.readFileSync(f, 'utf8'));
      });
      return `export default ${JSON.stringify(levels)};`;
    },
    handleHotUpdate({ file, server }) {
      if (file.endsWith('level.yaml')) {
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
      }
    },
  };
}


const { randomUUID } = require('node:crypto');
const { mkdir, open, readFile, readdir, unlink } = require('node:fs/promises');
const path = require('node:path');

function lines(content) {
  return content.split(/\r?\n/).flatMap((line) => {
    if (!line) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

const same = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();
const changed = (row) => row.time && row.before && row.after && !same(row.before.progId, row.after.progId);

function journal(directory) {
  const file = path.join(directory, 'association-history.jsonl');
  const pending = path.join(directory, 'pending-associations');

  async function read() {
    const content = await readFile(file, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    return lines(content).filter((row) => row?.id).reverse()
      .sort((first, second) => Date.parse(second.time) - Date.parse(first.time));
  }

  async function save(entries) {
    if (!entries.length) return;
    const existing = new Set((await read()).map((row) => row.id));
    const additions = entries.filter((entry) => !existing.has(entry.id));
    if (!additions.length) return;
    const handle = await open(file, 'a');
    try {
      // A leading newline isolates a truncated last line left by an interrupted append.
      await handle.writeFile('\n' + additions.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  return {
    read,
    async prepare(operation) {
      await mkdir(pending, { recursive: true });
      return path.join(pending, operation + '-' + randomUUID() + '.jsonl');
    },
    async reconcile(getStates, onlyFile) {
      const names = (onlyFile ? [path.basename(onlyFile)] : await readdir(pending).catch((error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      })).filter((name) => /^(apply|restore|rollback)-[0-9a-f-]+\.jsonl$/.test(name));
      const recovered = [];
      const uncertain = [];
      const failures = [];
      for (const name of names) {
        const source = path.join(pending, name);
        let content;
        try {
          // The worker's FileShare.None makes a live operation unreadable.
          content = await readFile(source, 'utf8');
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          if (!onlyFile && ['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) continue;
          throw error;
        }
        const attempts = new Map();
        for (const event of lines(content)) {
          if (event?.kind === 'start') attempts.set(event.id, { intent: event });
          if (event?.kind === 'finish' && attempts.has(event.id)) attempts.get(event.id).result = event.result;
        }
        const unfinished = [...attempts.values()].filter(({ result }) => !result);
        const states = unfinished.length ? await getStates(unfinished.map(({ intent }) => intent.extension)) : {};
        const entries = [];
        const unresolved = [];
        for (const { intent, result } of attempts.values()) {
          const actual = result ? result.after : states[intent.extension];
          const time = result ? result.time : intent.time;
          const row = { id: intent.id, extension: intent.extension, before: intent.before, after: actual,
            time, operation: name.split('-')[0], recovered: !result };
          if (changed(row) && (result || same(actual.progId, intent.desired))) entries.push(row);
          else if (!result && (!actual || !same(actual.progId, intent.before.progId))) unresolved.push(intent.extension);
        }
        uncertain.push(...unresolved);
        try {
          await save(entries);
          // An ambiguous transition remains available for a later reconciliation.
          if (!unresolved.length) await unlink(source);
          recovered.push(...entries);
        } catch (error) {
          failures.push({ extensions: entries.map((row) => row.extension), error });
        }
      }
      return { recovered, uncertain: [...new Set(uncertain)], failures };
    },
  };
}

module.exports = { journal };

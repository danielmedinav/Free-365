import { DocNotFoundError, type DocRepository } from '@free360/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FreeDb } from './db';
import { createDexieRepository } from './repository';

describe('Dexie repository', () => {
  let db: FreeDb;
  let clock: number;
  let repo: DocRepository;

  beforeEach(() => {
    db = new FreeDb(`test-${crypto.randomUUID()}`);
    clock = 1_000;
    repo = createDexieRepository({ db, now: () => (clock += 10) });
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates a document with a default title and empty content', async () => {
    const meta = await repo.create({ kind: 'write' });
    expect(meta.title).toBe('Untitled document');
    expect(meta.createdAt).toBe(meta.updatedAt);
    expect(await repo.getMeta(meta.id)).toEqual(meta);
    expect(await repo.getContent(meta.id)).toEqual({
      id: meta.id,
      kind: 'write',
      schemaVersion: 1,
      data: null,
    });
  });

  it('saves content and bumps updatedAt', async () => {
    const meta = await repo.create({ kind: 'grid', title: 'Budget' });
    const saved = await repo.saveContent(meta.id, { cells: { A1: 1 } }, 2);
    expect(saved.updatedAt).toBeGreaterThan(meta.updatedAt);
    expect(await repo.getContent(meta.id)).toMatchObject({
      schemaVersion: 2,
      data: { cells: { A1: 1 } },
    });
  });

  it('renames with normalization', async () => {
    const meta = await repo.create({ kind: 'deck' });
    expect((await repo.rename(meta.id, '  Pitch   deck ')).title).toBe('Pitch deck');
    expect((await repo.rename(meta.id, '')).title).toBe('Untitled presentation');
  });

  it('removes metadata and content together', async () => {
    const meta = await repo.create({ kind: 'write' });
    await repo.remove(meta.id);
    expect(await repo.getMeta(meta.id)).toBeUndefined();
    expect(await repo.getContent(meta.id)).toBeUndefined();
  });

  it('throws DocNotFoundError when updating a missing document', async () => {
    await expect(repo.rename('missing', 'x')).rejects.toBeInstanceOf(DocNotFoundError);
    await expect(repo.saveContent('missing', {}, 1)).rejects.toBeInstanceOf(DocNotFoundError);
  });

  it('lists most recently updated first, across apps or per app', async () => {
    const a = await repo.create({ kind: 'write', title: 'A' });
    const b = await repo.create({ kind: 'grid', title: 'B' });
    const c = await repo.create({ kind: 'write', title: 'C' });
    await repo.rename(a.id, 'A2');

    const all = await repo.listRecent();
    expect(all.map((d) => d.title)).toEqual(['A2', 'C', 'B']);

    const writes = await repo.listRecent({ kind: 'write' });
    expect(writes.map((d) => d.id)).toEqual([a.id, c.id]);

    const limited = await repo.listRecent({ limit: 2 });
    expect(limited.map((d) => d.id)).toEqual([a.id, c.id]);
    expect(b.kind).toBe('grid');
  });
});

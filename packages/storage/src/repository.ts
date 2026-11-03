import {
  type DocContent,
  type DocMeta,
  type DocRepository,
  DocNotFoundError,
  newDocId,
  normalizeTitle,
} from '@free360/core';
import { Dexie } from 'dexie';
import { FreeDb } from './db';

export type DexieRepositoryOptions = {
  db?: FreeDb;
  /** Injectable clock for tests. */
  now?: () => number;
};

export function createDexieRepository(options: DexieRepositoryOptions = {}): DocRepository {
  const db = options.db ?? new FreeDb();
  const now = options.now ?? Date.now;

  async function requireMeta(id: string): Promise<DocMeta> {
    const meta = await db.docs.get(id);
    if (!meta) throw new DocNotFoundError(id);
    return meta;
  }

  return {
    async create({ kind, title, schemaVersion = 1, data }) {
      const timestamp = now();
      const meta: DocMeta = {
        id: newDocId(),
        kind,
        title: normalizeTitle(title ?? '', kind),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const content: DocContent = { id: meta.id, kind, schemaVersion, data: data ?? null };
      await db.transaction('rw', db.docs, db.contents, async () => {
        await db.docs.add(meta);
        await db.contents.add(content);
      });
      return meta;
    },

    getMeta(id) {
      return db.docs.get(id);
    },

    async getContent<T>(id: string) {
      return (await db.contents.get(id)) as DocContent<T> | undefined;
    },

    async saveContent(id, data, schemaVersion) {
      return db.transaction('rw', db.docs, db.contents, async () => {
        const meta = await requireMeta(id);
        const updated: DocMeta = { ...meta, updatedAt: now() };
        await db.contents.put({ id, kind: meta.kind, schemaVersion, data });
        await db.docs.put(updated);
        return updated;
      });
    },

    async rename(id, title) {
      return db.transaction('rw', db.docs, async () => {
        const meta = await requireMeta(id);
        const updated: DocMeta = {
          ...meta,
          title: normalizeTitle(title, meta.kind),
          updatedAt: now(),
        };
        await db.docs.put(updated);
        return updated;
      });
    },

    async remove(id) {
      await db.transaction('rw', db.docs, db.contents, async () => {
        await db.docs.delete(id);
        await db.contents.delete(id);
      });
    },

    async listRecent({ kind, limit } = {}) {
      const collection = kind
        ? db.docs
            .where('[kind+updatedAt]')
            .between([kind, Dexie.minKey], [kind, Dexie.maxKey])
            .reverse()
        : db.docs.orderBy('updatedAt').reverse();
      return limit === undefined ? collection.toArray() : collection.limit(limit).toArray();
    },
  };
}

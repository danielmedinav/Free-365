import type { DocContent, DocMeta } from '@free360/core';
import { Dexie, type Table } from 'dexie';

export const DB_NAME = 'free360';

export class FreeDb extends Dexie {
  docs!: Table<DocMeta, string>;
  contents!: Table<DocContent, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      docs: 'id, kind, updatedAt, [kind+updatedAt]',
      contents: 'id',
    });
  }
}

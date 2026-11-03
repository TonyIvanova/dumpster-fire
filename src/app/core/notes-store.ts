import { Injectable, inject, signal } from '@angular/core';
import { Note } from './note';
import { Toast } from './toast';

const NOTES_KEY = 'df.notes';
const SETTINGS_KEY = 'df.settings';

export type Theme = 'beige' | 'light' | 'dark';

export interface Settings {
  minutes: number;
  grace: number;
  hardcore: boolean;
  autocorrect: boolean;
  prompt: boolean;
  theme: Theme;
  googleConnected: boolean;
  googleFolderId: string | null;
}

const DEFAULTS: Settings = {
  minutes: 5,
  grace: 5,
  hardcore: false,
  autocorrect: true,
  prompt: false,
  theme: 'beige',
  googleConnected: false,
  googleFolderId: null,
};

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const newestFirst = (a: Note, b: Note) => b.createdAt - a.createdAt;

@Injectable({ providedIn: 'root' })
export class NotesStore {
  private readonly toast = inject(Toast);

  readonly settings = signal<Settings>({ ...DEFAULTS, ...read(SETTINGS_KEY, {}) });
  readonly notes = signal<Note[]>(read<Note[]>(NOTES_KEY, []));

  updateSettings(changes: Partial<Settings>): void {
    this.settings.update((current) => ({ ...current, ...changes }));
    write(SETTINGS_KEY, this.settings());
  }

  find(id: string): Note | undefined {
    return this.notes().find((note) => note.id === id);
  }

  addNote(text: string, pages: number): Note {
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      text,
      pages,
      createdAt: now,
      updatedAt: now,
      driveId: null,
      syncedAt: 0,
    };
    this.commit([note, ...this.notes()]);
    return note;
  }

  patchNote(id: string, changes: Partial<Note>): void {
    this.commit(this.notes().map((note) => (note.id === id ? { ...note, ...changes } : note)));
  }

  removeNote(id: string): void {
    this.commit(this.notes().filter((note) => note.id !== id));
  }

  addNotes(added: Note[]): void {
    this.commit([...this.notes(), ...added].sort(newestFirst));
  }

  exportJson(): string {
    return JSON.stringify(
      { app: 'dump', version: 1, exportedAt: new Date().toISOString(), notes: this.notes() },
      null,
      2,
    );
  }

  // Adds what's new and takes the newer copy of what isn't. Returns how many notes changed.
  importJson(raw: string): number {
    const data = JSON.parse(raw);
    const incoming: unknown = Array.isArray(data) ? data : data?.notes;
    if (!Array.isArray(incoming)) throw new Error('That file has no notes in it.');

    const merged = new Map(this.notes().map((note) => [note.id, note]));
    let changed = 0;
    for (const item of incoming) {
      if (!item || typeof item.text !== 'string') continue;
      const clean: Note = {
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        text: item.text,
        pages: Number(item.pages) || 1,
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
        driveId: typeof item.driveId === 'string' ? item.driveId : null,
        syncedAt: Number(item.syncedAt) || 0,
      };
      const existing = merged.get(clean.id);
      if (!existing || clean.updatedAt > existing.updatedAt) {
        merged.set(clean.id, clean);
        changed++;
      }
    }
    this.commit([...merged.values()].sort(newestFirst));
    return changed;
  }

  private commit(notes: Note[]): void {
    this.notes.set(notes);
    if (!write(NOTES_KEY, notes)) {
      this.toast.show("This browser won't store any more. Download a backup now.", 8000);
    }
  }
}

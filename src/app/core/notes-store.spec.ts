import { TestBed } from '@angular/core/testing';
import { NotesStore } from './notes-store';

describe('NotesStore', () => {
  beforeEach(() => localStorage.clear());

  const store = () => TestBed.inject(NotesStore);

  it('persists a new note', () => {
    const note = store().addNote('Hello', 2);
    const saved = JSON.parse(localStorage.getItem('df.notes')!);
    expect(saved[0].id).toBe(note.id);
    expect(saved[0].pages).toBe(2);
  });

  it('round-trips through a backup file', () => {
    const note = store().addNote('Hello', 1);
    const backup = store().exportJson();
    store().removeNote(note.id);

    expect(store().importJson(backup)).toBe(1);
    expect(store().find(note.id)?.text).toBe('Hello');
  });

  it('keeps the newer copy when restoring', () => {
    const note = store().addNote('Old', 1);
    const newer = { ...note, text: 'New', updatedAt: note.updatedAt + 1 };
    const older = { ...note, text: 'Older', updatedAt: note.updatedAt - 1 };

    expect(store().importJson(JSON.stringify({ notes: [older] }))).toBe(0);
    expect(store().find(note.id)?.text).toBe('Old');
    expect(store().importJson(JSON.stringify({ notes: [newer] }))).toBe(1);
    expect(store().find(note.id)?.text).toBe('New');
  });

  it('rejects a file with no notes and skips bad entries', () => {
    expect(() => store().importJson('{"nope":1}')).toThrow();
    expect(store().importJson(JSON.stringify([null, { text: 5 }, { text: 'ok' }]))).toBe(1);
    expect(store().notes().length).toBe(1);
  });
});

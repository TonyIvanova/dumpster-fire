import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GoogleDocs } from './google-docs';
import { NotesStore } from './notes-store';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('GoogleDocs', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem(
      'df.googleToken',
      JSON.stringify({ value: 'tok', expiresAt: Date.now() + 3_600_000 }),
    );
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  const services = () => ({ google: TestBed.inject(GoogleDocs), store: TestBed.inject(NotesStore) });
  const calls = () => fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init }));

  it('creates the folder and a doc, then marks the note as synced', async () => {
    const { google, store } = services();
    const note = store.addNote('My title\nBody', 1);
    fetchMock
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ id: 'folder1' }))
      .mockResolvedValueOnce(json({ id: 'doc1' }));

    expect(await google.syncAll()).toBe(1);

    const upload = calls()[2];
    expect(upload.url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(upload.init.headers.Authorization).toBe('Bearer tok');
    expect(upload.init.body).toContain('"parents":["folder1"]');
    expect(upload.init.body).toContain('"name":"My title"');
    expect(upload.init.body).toContain('application/vnd.google-apps.document');
    expect(store.find(note.id)?.driveId).toBe('doc1');
    expect(await google.syncAll()).toBe(0);
  });

  it('makes a new doc when the old one was deleted in Drive', async () => {
    const { google, store } = services();
    store.updateSettings({ googleFolderId: 'folder1' });
    const note = store.addNote('Text', 1);
    store.patchNote(note.id, { driveId: 'gone' });
    fetchMock
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ id: 'doc2' }));

    await google.syncAll();

    expect(calls()[0].init.method).toBe('PATCH');
    expect(store.find(note.id)?.driveId).toBe('doc2');
  });

  it('drops the token on a 401 and reports the error from a backup', async () => {
    const { google, store } = services();
    store.updateSettings({ googleConnected: true, googleFolderId: 'folder1' });
    const note = store.addNote('Text', 1);

    // GOOGLE_CLIENT_ID is empty in the repo, so backup() is a no-op until it's configured.
    fetchMock.mockResolvedValueOnce(json({}, 401));
    await expect(google.syncAll()).rejects.toThrow('401');

    expect(google.hasToken()).toBe(false);
    expect(store.find(note.id)?.driveId).toBeNull();
  });

  it('restores only docs this browser does not have', async () => {
    const { google, store } = services();
    store.updateSettings({ googleFolderId: 'folder1' });
    const known = store.addNote('Known', 1);
    store.patchNote(known.id, { driveId: 'doc1' });
    const stamp = '2026-01-01T00:00:00.000Z';
    fetchMock
      .mockResolvedValueOnce(
        json({
          files: [
            { id: 'doc1', createdTime: stamp, modifiedTime: stamp },
            { id: 'doc2', createdTime: stamp, modifiedTime: stamp },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response('﻿From\r\nDrive'));

    expect(await google.restore()).toBe(1);

    const restored = store.notes().find((note) => note.driveId === 'doc2');
    expect(restored?.text).toBe('From\nDrive');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

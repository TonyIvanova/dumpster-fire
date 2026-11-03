import { Injectable, inject, signal } from '@angular/core';
import { GOOGLE_CLIENT_ID } from '../config';
import { Note, titleOf } from './note';
import { NotesStore } from './notes-store';

// drive.file only reaches files this app created, never the rest of your Drive.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Dump';
const DOC_MIME = 'application/vnd.google-apps.document';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const TOKEN_KEY = 'df.googleToken';

interface Token {
  value: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number | string;
  error?: string;
  error_description?: string;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: (error: { message?: string }) => void;
      }): { requestAccessToken(options: { prompt: string }): void };
      revoke(token: string): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Google said ${status}.`);
  }
}

function escapeQuery(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function multipart(metadata: object, text: string): RequestInit {
  const boundary = `df${crypto.randomUUID().replaceAll('-', '')}`;
  return {
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body:
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`,
  };
}

export function isDirty(note: Note): boolean {
  return Boolean(note.text.trim()) && (!note.driveId || note.updatedAt > note.syncedAt);
}

@Injectable({ providedIn: 'root' })
export class GoogleDocs {
  private readonly store = inject(NotesStore);

  readonly configured = Boolean(GOOGLE_CLIENT_ID);
  readonly lastError = signal<string | null>(null);

  // Browser-only apps get a token that lasts about an hour and no refresh token.
  // sessionStorage keeps it across reloads and lets it die with the tab.
  private readonly token = signal<Token | null>(this.readToken());
  private gisLoading: Promise<void> | null = null;
  // One at a time, so two quick saves can't create the same doc twice.
  private queue: Promise<unknown> = Promise.resolve();

  hasToken(): boolean {
    const token = this.token();
    return Boolean(token && token.expiresAt > Date.now() + 30_000);
  }

  // Opens Google's popup, so it has to run from a click.
  async connect(): Promise<void> {
    await this.loadGis();
    const response = await new Promise<TokenResponse>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPE,
        callback: resolve,
        error_callback: (error) =>
          reject(new Error(error.message || 'Google sign-in was cancelled.')),
      });
      client.requestAccessToken({
        prompt: this.store.settings().googleConnected ? '' : 'consent',
      });
    });
    if (response.error) throw new Error(response.error_description || response.error);

    this.setToken({
      value: response.access_token,
      expiresAt: Date.now() + Number(response.expires_in) * 1000,
    });
    this.lastError.set(null);
    this.store.updateSettings({ googleConnected: true });
  }

  disconnect(): void {
    const token = this.token();
    if (token) window.google?.accounts.oauth2.revoke(token.value);
    this.setToken(null);
    this.store.updateSettings({ googleConnected: false, googleFolderId: null });
  }

  // Quietly backs up one note if it can. Problems end up in lastError for the editor to show.
  async backup(id: string): Promise<void> {
    if (!this.configured || !this.store.settings().googleConnected || !this.hasToken()) return;
    try {
      await this.enqueue(() => this.pushNote(id));
      this.lastError.set(null);
    } catch (error) {
      this.lastError.set((error as Error).message);
    }
  }

  // Returns how many notes were sent.
  syncAll(): Promise<number> {
    return this.enqueue(async () => {
      const dirty = this.store.notes().filter(isDirty);
      for (const note of dirty) await this.pushNote(note.id);
      return dirty.length;
    });
  }

  // Pulls in docs from the folder that this browser doesn't have yet. Returns how many.
  async restore(): Promise<number> {
    const parent = await this.folderId();
    const q = `'${escapeQuery(parent)}' in parents and mimeType='${DOC_MIME}' and trashed=false`;
    const known = new Set(this.store.notes().map((note) => note.driveId));
    const added: Note[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        fields: 'nextPageToken,files(id,createdTime,modifiedTime)',
        pageSize: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const listing = await (await this.api(`${DRIVE}?${params}`)).json();
      for (const file of listing.files) {
        if (known.has(file.id)) continue;
        const exported = await this.api(`${DRIVE}/${file.id}/export?mimeType=text%2Fplain`);
        const text = (await exported.text()).replace(/^﻿/, '').replaceAll('\r\n', '\n');
        const modified = Date.parse(file.modifiedTime);
        added.push({
          id: crypto.randomUUID(),
          text,
          pages: 1,
          createdAt: Date.parse(file.createdTime),
          updatedAt: modified,
          driveId: file.id,
          syncedAt: modified,
        });
      }
      pageToken = listing.nextPageToken;
    } while (pageToken);
    this.store.addNotes(added);
    return added.length;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const job = this.queue.then(work);
    this.queue = job.catch(() => {});
    return job;
  }

  private readToken(): Token | null {
    try {
      return JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private setToken(value: Token | null): void {
    this.token.set(value);
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  private loadGis(): Promise<void> {
    this.gisLoading ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => resolve();
      script.onerror = () => {
        this.gisLoading = null;
        reject(new Error("Couldn't reach Google."));
      };
      document.head.append(script);
    });
    return this.gisLoading;
  }

  private async api(url: string, options: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${this.token()?.value}` },
    });
    if (response.status === 401) this.setToken(null);
    if (!response.ok) throw new HttpError(response.status);
    return response;
  }

  private async findFolder(): Promise<string | null> {
    const q = `name='${escapeQuery(FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    const params = new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' });
    const response = await this.api(`${DRIVE}?${params}`);
    return (await response.json()).files[0]?.id ?? null;
  }

  private async folderId(): Promise<string> {
    const saved = this.store.settings().googleFolderId;
    if (saved) return saved;
    let id = await this.findFolder();
    if (!id) {
      const response = await this.api(DRIVE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      id = (await response.json()).id as string;
    }
    this.store.updateSettings({ googleFolderId: id });
    return id;
  }

  private async createDoc(name: string, text: string): Promise<string> {
    const parent = await this.folderId();
    try {
      const response = await this.api(`${UPLOAD}?uploadType=multipart&fields=id`, {
        method: 'POST',
        ...multipart({ name, mimeType: DOC_MIME, parents: [parent] }, text),
      });
      return (await response.json()).id;
    } catch (error) {
      // Someone removed the folder. Forget it and make a new one next time.
      if (error instanceof HttpError && error.status === 404) {
        this.store.updateSettings({ googleFolderId: null });
      }
      throw error;
    }
  }

  private async pushNote(id: string): Promise<void> {
    const note = this.store.find(id);
    if (!note || !isDirty(note)) return;

    const name = titleOf(note.text);
    let driveId = note.driveId;
    if (driveId) {
      try {
        await this.api(`${UPLOAD}/${driveId}?uploadType=multipart&fields=id`, {
          method: 'PATCH',
          ...multipart({ name }, note.text),
        });
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error;
        driveId = await this.createDoc(name, note.text); // the doc was deleted in Drive
      }
    } else {
      driveId = await this.createDoc(name, note.text);
    }
    this.store.patchNote(id, { driveId, syncedAt: note.updatedAt });
  }
}

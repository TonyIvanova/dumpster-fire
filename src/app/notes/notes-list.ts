import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GoogleDocs } from '../core/google-docs';
import { Note, download, plural, titleOf, wordCount } from '../core/note';
import { NotesStore } from '../core/notes-store';
import { Toast } from '../core/toast';
import { PICTURE_TILES, buildPicture } from './picture';

@Component({
  imports: [DatePipe, RouterLink],
  selector: 'app-notes-list',
  styleUrl: './notes-list.css',
  templateUrl: './notes-list.html',
})
export class NotesList {
  private readonly store = inject(NotesStore);
  private readonly toast = inject(Toast);
  protected readonly google = inject(GoogleDocs);

  protected readonly notes = this.store.notes;
  protected readonly titleOf = titleOf;
  protected readonly wordsIn = (note: Note) => plural(wordCount(note.text), 'word');

  protected readonly total = computed(() => {
    const notes = this.notes();
    if (!notes.length) return '';
    const pages = notes.reduce((sum, note) => sum + (note.pages || 1), 0);
    return `${plural(notes.length, 'note')}, ${plural(pages, 'page')}`;
  });

  protected readonly picture = computed(() => buildPicture(this.notes()));
  protected readonly pictureCaption = computed(() => {
    const { filled, round } = this.picture();
    if (filled === PICTURE_TILES) return `Picture ${round} finished. ${PICTURE_TILES} notes.`;
    const progress = `${filled} of ${PICTURE_TILES}`;
    return round > 1 ? `Picture ${round}: ${progress}` : progress;
  });

  protected readonly googleStatus = signal('');
  // Bumped after connecting and disconnecting, which the token's expiry check can't see on its own.
  private readonly googleChanged = signal(0);
  protected readonly googleLive = computed(() => {
    this.googleChanged();
    return this.google.hasToken();
  });
  protected readonly connectLabel = computed(() => {
    if (this.googleLive()) return 'Disconnect Google Docs';
    return this.store.settings().googleConnected ? 'Reconnect Google Docs' : 'Connect Google Docs';
  });

  protected remove(note: Note): void {
    const extra = note.driveId ? ' Its Google Doc stays in Drive.' : '';
    if (window.confirm(`Delete "${titleOf(note.text)}"?${extra}`)) this.store.removeNote(note.id);
  }

  protected exportAll(): void {
    const day = new Date().toISOString().slice(0, 10);
    download(`dump-${day}.json`, 'application/json', this.store.exportJson());
  }

  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const changed = this.store.importJson(await file.text());
      this.toast.show(`${plural(changed, 'note')} restored.`);
    } catch {
      this.toast.show("That file doesn't look like a Dump backup.");
    }
  }

  protected async toggleGoogle(): Promise<void> {
    if (this.googleLive()) {
      this.google.disconnect();
      this.googleChanged.update((n) => n + 1);
      this.googleStatus.set('Disconnected. Your docs stay in Drive.');
      return;
    }
    try {
      await this.google.connect();
      this.googleChanged.update((n) => n + 1);
      this.googleStatus.set('Backing up…');
      const sent = await this.google.syncAll();
      this.googleStatus.set(sent ? `${plural(sent, 'note')} backed up.` : 'Everything is backed up.');
    } catch (error) {
      this.googleChanged.update((n) => n + 1);
      this.googleStatus.set((error as Error).message);
    }
  }

  protected async restoreFromGoogle(): Promise<void> {
    this.googleStatus.set('Looking in Drive…');
    try {
      const added = await this.google.restore();
      this.googleStatus.set(added ? `${plural(added, 'note')} restored.` : 'Nothing new in Drive.');
    } catch (error) {
      this.googleChanged.update((n) => n + 1);
      this.googleStatus.set((error as Error).message);
    }
  }
}

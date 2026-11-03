import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GoogleDocs, isDirty } from '../core/google-docs';
import { download, plural, titleOf, wordCount } from '../core/note';
import { NotesStore } from '../core/notes-store';

const SYNC_DELAY_MS = 4000;

@Component({
  imports: [RouterLink],
  selector: 'app-editor',
  styleUrl: './editor.css',
  templateUrl: './editor.html',
})
export class Editor implements OnDestroy {
  private readonly store = inject(NotesStore);
  private readonly google = inject(GoogleDocs);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly textRef = viewChild<ElementRef<HTMLTextAreaElement>>('text');
  private syncTimer?: ReturnType<typeof setTimeout>;
  private deleted = false;

  protected readonly note = computed(() => this.store.find(this.id()));
  protected readonly words = computed(() => plural(wordCount(this.note()?.text ?? ''), 'word'));
  protected readonly reconnecting = signal(false);

  protected readonly docUrl = computed(() => {
    const driveId = this.note()?.driveId;
    return driveId ? `https://docs.google.com/document/d/${encodeURIComponent(driveId)}/edit` : '';
  });

  protected readonly syncState = computed(() => {
    const note = this.note();
    if (!note || !this.google.configured || !this.store.settings().googleConnected) return 'local';
    if (this.google.lastError()) return 'error';
    if (note.driveId && !isDirty(note)) return 'linked';
    return this.google.hasToken() ? 'pending' : 'reconnect';
  });
  protected readonly syncError = this.google.lastError;

  constructor() {
    afterNextRender(() => {
      const textarea = this.textRef()?.nativeElement;
      const note = this.note();
      if (!textarea || !note) {
        this.router.navigate(['/notes']);
        return;
      }
      // Set once rather than bound, so typing never rewrites the field under the caret.
      textarea.value = note.text;
      this.autosize(textarea);
      textarea.focus();
      textarea.setSelectionRange(note.text.length, note.text.length);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.syncTimer);
    if (!this.deleted && this.note()) this.google.backup(this.id());
  }

  protected onInput(textarea: HTMLTextAreaElement): void {
    this.autosize(textarea);
    this.store.patchNote(this.id(), { text: textarea.value, updatedAt: Date.now() });

    clearTimeout(this.syncTimer);
    const id = this.id();
    this.syncTimer = setTimeout(() => this.google.backup(id), SYNC_DELAY_MS);
  }

  protected downloadNote(): void {
    const text = this.note()?.text ?? '';
    const name = titleOf(text).replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'note';
    download(`${name}.txt`, 'text/plain;charset=utf-8', text);
  }

  protected deleteNote(): void {
    const note = this.note();
    if (!note) return;
    const extra = note.driveId ? ' Its Google Doc stays in Drive.' : '';
    if (!window.confirm(`Delete "${titleOf(note.text)}"?${extra}`)) return;
    this.deleted = true;
    this.store.removeNote(note.id);
    this.router.navigate(['/notes']);
  }

  protected async reconnect(): Promise<void> {
    this.reconnecting.set(true);
    try {
      await this.google.connect();
      await this.google.syncAll();
    } catch (error) {
      this.google.lastError.set((error as Error).message);
    } finally {
      this.reconnecting.set(false);
    }
  }

  private autosize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }
}

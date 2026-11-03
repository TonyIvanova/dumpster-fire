import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { correctWithContext } from '../core/autocorrect';
import { GoogleDocs } from '../core/google-docs';
import { wordCount } from '../core/note';
import { NotesStore } from '../core/notes-store';
import { Toast } from '../core/toast';
import { Fire } from './fire';
import { randomPrompt } from './prompts';

const BOUNDARY = /[\s.,!?;:]/;
const CONTEXT_LENGTH = 200;
const BURN_MS = 1100;
const NAV_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);
const BLOCKED_INPUT = new Set(['insertFromPaste', 'insertFromDrop', 'insertFromYank']);

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

@Component({
  imports: [Fire],
  selector: 'app-write',
  styleUrl: './write.css',
  templateUrl: './write.html',
  host: { '(window:beforeunload)': 'warnBeforeUnload($event)' },
})
export class Write implements OnDestroy {
  private readonly store = inject(NotesStore);
  private readonly google = inject(GoogleDocs);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);

  private readonly pageRef = viewChild.required<ElementRef<HTMLTextAreaElement>>('page');
  private readonly sheetRef = viewChild.required<ElementRef<HTMLElement>>('sheet');
  private get page(): HTMLTextAreaElement {
    return this.pageRef().nativeElement;
  }

  private readonly durationMs = this.store.settings().minutes * 60_000;
  private readonly graceMs = this.store.settings().grace * 1000;
  private readonly hardcore = this.store.settings().hardcore;
  private readonly autocorrect = this.store.settings().autocorrect;

  private pages: string[] = [];
  private previous = '';
  private active = true;
  private endsAt = 0;
  private lastInput = 0;
  private ticker?: ReturnType<typeof setInterval>;
  private burnTimer?: ReturnType<typeof setTimeout>;

  protected readonly started = signal(false);
  protected readonly prompt = signal(this.store.settings().prompt ? randomPrompt() : null);
  protected readonly clock = signal(formatTime(this.durationMs));
  protected readonly left = signal(1);
  protected readonly heat = signal(0);
  protected readonly pageNumber = signal(1);
  protected readonly burning = signal(false);
  protected readonly hint = signal(
    this.hardcore
      ? 'The clock starts when you type. No going back.'
      : 'The clock starts when you type.',
  );

  constructor() {
    document.body.classList.add('writing');
    afterNextRender(() => this.page.focus());
  }

  ngOnDestroy(): void {
    document.body.classList.remove('writing');
    clearInterval(this.ticker);
    clearTimeout(this.burnTimer);
  }

  // The browser's back button shouldn't burn a page by accident.
  canLeave(): boolean {
    if (!this.active || !this.started()) return true;
    return window.confirm('Leave now and this burns.');
  }

  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.active && this.started()) event.preventDefault();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.active) return;
    const { key } = event;

    if (key === 'Tab') {
      event.preventDefault();
    } else if (this.hardcore) {
      const command = event.ctrlKey || event.metaKey;
      const combo = command && ['a', 'x', 'z', 'y'].includes(key.toLowerCase());
      if (key === 'Backspace' || key === 'Delete' || NAV_KEYS.has(key) || combo) {
        event.preventDefault();
      }
    } else if (key === 'Backspace' && !this.page.value && this.pages.length) {
      event.preventDefault();
      this.lastInput = Date.now();
      this.backOnePage();
    }
  }

  protected onBeforeInput(event: InputEvent): void {
    if (!this.active) return;
    const type = event.inputType;
    const deleting = type.startsWith('delete') || type.startsWith('history');
    if (BLOCKED_INPUT.has(type) || (this.hardcore && deleting)) event.preventDefault();
  }

  protected onInput(event: Event): void {
    const input = event as InputEvent;
    if (!this.active || input.isComposing) return;

    // Some phone keyboards delete without a cancellable event. Put it back.
    if (this.hardcore && this.page.value.length < this.previous.length) {
      this.page.value = this.previous;
      this.pinCaret();
      return;
    }

    const now = Date.now();
    if (!this.started()) {
      this.started.set(true);
      this.endsAt = now + this.durationMs;
      this.ticker = setInterval(() => this.tick(), 100);
      this.hint.set('');
    }
    this.lastInput = now;
    this.heat.set(0);

    if (this.autocorrect && (input.inputType === 'insertText' || input.inputType === 'insertLineBreak')) {
      this.applyAutocorrect();
    }
    this.turnPages();
    this.previous = this.page.value;
  }

  protected onCompositionEnd(): void {
    if (!this.active) return;
    this.lastInput = Date.now();
    this.turnPages();
    this.previous = this.page.value;
  }

  protected blockTransfer(event: Event): void {
    if (this.active && (event.type !== 'cut' || this.hardcore)) event.preventDefault();
  }

  protected pinCaret(): void {
    if (this.active && this.hardcore) {
      this.page.setSelectionRange(this.page.value.length, this.page.value.length);
    }
  }

  protected refocus(event: Event): void {
    if (this.active && !(event.target instanceof HTMLButtonElement)) this.page.focus();
  }

  protected anotherPrompt(): void {
    this.prompt.update((word) => randomPrompt(word ?? undefined));
    this.page.focus();
  }

  protected giveUp(): void {
    if (!this.active) return;
    if (this.started()) {
      this.burn();
    } else {
      this.active = false;
      this.router.navigate(['/']);
    }
  }

  private get text(): string {
    return this.pages.join('') + this.page.value;
  }

  private tick(): void {
    const now = Date.now();
    const burnsAt = this.lastInput + this.graceMs;

    // A throttled background tab can wake up past both deadlines. Whichever came first wins.
    if (now >= burnsAt && burnsAt < this.endsAt) {
      this.burn();
    } else if (now >= this.endsAt) {
      this.finish();
    } else {
      const idle = (now - this.lastInput) / this.graceMs;
      this.heat.set(Math.max(0, (idle - 0.3) / 0.7));
      this.clock.set(formatTime(this.endsAt - now));
      this.left.set((this.endsAt - now) / this.durationMs);
    }
  }

  private stop(): void {
    this.active = false;
    clearInterval(this.ticker);
  }

  private burn(): void {
    const words = wordCount(this.text);
    this.stop();
    this.page.blur();
    this.heat.set(1);
    this.burning.set(true);
    this.burnTimer = setTimeout(() => {
      this.page.value = '';
      this.router.navigate(['/burned'], { state: { words } });
    }, BURN_MS);
  }

  private finish(): void {
    const text = this.text;
    const pageCount = this.pages.length + 1;
    this.stop();
    const note = this.store.addNote(text, pageCount);
    this.toast.show('Time. Saved. Keep going, or fix whatever you like.');
    this.google.backup(note.id);
    this.router.navigate(['/notes', note.id]);
  }

  private fits(): boolean {
    return this.page.scrollHeight <= this.page.clientHeight;
  }

  // Puts as much of `text` on the page as fits, breaking at a word, and returns the rest.
  private fitOnPage(text: string): string {
    this.page.value = text;
    if (this.fits()) return '';

    let cut = text.length;
    while (cut > 0) {
      const search = text.slice(0, cut - 1);
      const space = Math.max(search.lastIndexOf(' '), search.lastIndexOf('\n'));
      if (space < 0) break;
      cut = space + 1;
      this.page.value = text.slice(0, cut);
      if (this.fits()) return text.slice(cut);
    }

    // One enormous word, so it has to break somewhere.
    cut = text.length - 1;
    this.page.value = text.slice(0, cut);
    while (cut > 1 && !this.fits()) this.page.value = text.slice(0, --cut);
    return text.slice(cut);
  }

  private turnPages(): void {
    if (this.fits()) return;

    let rest = this.fitOnPage(this.page.value);
    while (rest) {
      this.pages.push(this.page.value);
      rest = this.fitOnPage(rest);
    }
    this.page.setSelectionRange(this.page.value.length, this.page.value.length);
    this.pageNumber.set(this.pages.length + 1);

    const sheet = this.sheetRef().nativeElement;
    sheet.classList.remove('turn');
    void sheet.offsetWidth; // restart the animation
    sheet.classList.add('turn');
  }

  private backOnePage(): void {
    this.page.value = this.pages.pop() ?? '';
    this.page.setSelectionRange(this.page.value.length, this.page.value.length);
    this.previous = this.page.value;
    this.pageNumber.set(this.pages.length + 1);
  }

  private applyAutocorrect(): void {
    const caret = this.page.selectionStart;
    const before = this.page.value.slice(0, caret);
    if (!BOUNDARY.test(before.at(-1) ?? '')) return;

    const context = this.pages.at(-1)?.slice(-CONTEXT_LENGTH) ?? '';
    const fixed = correctWithContext(context, before);
    if (fixed === before) return;
    this.page.value = fixed + this.page.value.slice(caret);
    this.page.setSelectionRange(fixed.length, fixed.length);
  }
}

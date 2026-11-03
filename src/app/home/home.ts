import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NotesStore } from '../core/notes-store';

function clamp(value: number | null, min: number, max: number, fallback: number): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(max, Math.max(min, number)) : fallback;
}

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  private readonly store = inject(NotesStore);
  private readonly router = inject(Router);

  private readonly saved = this.store.settings();
  protected readonly minutes = signal<number | null>(this.saved.minutes);
  protected readonly grace = signal<number | null>(this.saved.grace);
  protected readonly hardcore = signal(this.saved.hardcore);
  protected readonly autocorrect = signal(this.saved.autocorrect);

  protected start(): void {
    this.store.updateSettings({
      minutes: clamp(this.minutes(), 1, 180, this.saved.minutes),
      grace: clamp(this.grace(), 2, 60, this.saved.grace),
      hardcore: this.hardcore(),
      autocorrect: this.autocorrect(),
    });
    this.router.navigate(['/write']);
  }
}

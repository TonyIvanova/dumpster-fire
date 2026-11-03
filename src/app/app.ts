import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotesStore, Theme } from './core/notes-store';
import { Toast } from './core/toast';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly store = inject(NotesStore);
  protected readonly toast = inject(Toast);

  protected readonly themes: { id: Theme; label: string }[] = [
    { id: 'beige', label: 'Beige' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  protected readonly theme = () => this.store.settings().theme;

  constructor() {
    effect(() => {
      document.documentElement.dataset['theme'] = this.theme();
    });
  }

  protected setTheme(theme: Theme): void {
    this.store.updateSettings({ theme });
  }
}

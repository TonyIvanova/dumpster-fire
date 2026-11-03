import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { plural } from '../core/note';

@Component({
  imports: [RouterLink],
  selector: 'app-burned',
  styleUrl: './burned.css',
  templateUrl: './burned.html',
})
export class Burned {
  private readonly words = Number(history.state?.words) || 0;

  protected readonly detail = this.words
    ? `${plural(this.words, 'word')}, gone.`
    : 'Nothing lost, nothing gained.';
}

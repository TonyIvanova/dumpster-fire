import { Routes } from '@angular/router';
import { Burned } from './burned/burned';
import { Editor } from './editor/editor';
import { Home } from './home/home';
import { NotesList } from './notes/notes-list';
import { Write } from './write/write';

export const routes: Routes = [
  { path: '', component: Home, title: 'Dump' },
  {
    path: 'write',
    component: Write,
    title: 'Keep typing',
    canDeactivate: [(write: Write) => write.canLeave()],
  },
  { path: 'burned', component: Burned, title: 'Burned' },
  { path: 'notes', component: NotesList, title: 'Notes' },
  { path: 'notes/:id', component: Editor, title: 'Note' },
  { path: '**', redirectTo: '' },
];

import { Note } from '../core/note';

export const PICTURE_SIZE = 25;
export const PICTURE_TILES = PICTURE_SIZE * PICTURE_SIZE;

const PALETTE: Record<string, string> = {
  '.': '#8fc7d9', // sky, top
  ',': '#b7dde0', // sky, middle
  "'": '#f6dcc0', // sky, horizon
  c: '#fbf6ea', // cloud
  s: '#ffe9b8', // sun's glow
  S: '#ffd98a', // sun
  K: '#2a2c33', // skunk
  W: '#f5f5f0', // skunk's stripes, closed eyes and smile
  P: '#f783ac', // skunk's nose
  C: '#d98a9a', // skunk's cheeks
  h: '#a9cfa0', // far hill
  g: '#7cb274', // grass
  d: '#639a60', // grass, dark
  f: '#f7a8c4', // flower
  y: '#ffe066', // flower
};

// A skunk at peace, meditating on a hill at sunrise.
export const PICTURE = [
  '...ccc...................',
  '..ccccc............cc....',
  '.........sssssss...cccc..',
  ',,,,,,,ssSSSSSSSss,,,,,,,',
  ',,,,,,sSKKSSSSSKKSs,,,,,,',
  ',,,,,sSKKKKWWWKKKKSs,KKK,',
  "''''sSSKKKKWWWKKKKSs'KWWK",
  "''''sSSKWWKKWKKWWKSs'KWWK",
  "''''ssSKKKKKWKKKKKSs'KWWK",
  "'''''''KCKKKPKKKCK'''KWWK",
  'hhhhhhhhKKWKKKWKKhhhKWWKh',
  'hhhhhhhhhKKWWWKKhhhKWWKhh',
  'hhhhhhhKKKKWWWKKKKhKWWKhh',
  'hhhhhhKKKKKWWWKKKKKWWKhhh',
  'ggggghKKKKKWWWKKKKKKKKhhg',
  'gggggKKKKWWWWWWWKKKKKgggg',
  'gfgggKKKKKKWWWKKKKKKggggy',
  'ggggKKKKKKKKKKKKKKKKKgggg',
  'gggKKKKKKKKKKKKKKKKKKKggg',
  'ggdgKKKKggggggggKKKKgdggg',
  'gggggggdggggfgggggggdgggg',
  'gfggdgggggggggggyggggggfg',
  'ddgggggdgggggfggggdggggdg',
  'gggyggggggddgggggggggyggg',
  'ddddddddddddddddddddddddd',
];

export interface Tile {
  key: number;
  color: string;
  note: Note | null;
  newest: boolean;
}

export interface PictureProgress {
  tiles: Tile[];
  filled: number;
  round: number;
}

// Oldest note goes bottom left, and they pile up from there. Once a picture is
// full, the next note starts it again as the next round.
export function buildPicture(notes: Note[]): PictureProgress {
  const round = notes.length ? Math.floor((notes.length - 1) / PICTURE_TILES) : 0;
  const current = [...notes]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(round * PICTURE_TILES);

  const tiles: Tile[] = [];
  PICTURE.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      const order = (PICTURE_SIZE - 1 - y) * PICTURE_SIZE + x;
      const note = current[order] ?? null;
      tiles.push({
        key: y * PICTURE_SIZE + x,
        color: PALETTE[pixel],
        note,
        newest: note !== null && order === current.length - 1,
      });
    });
  });
  return { tiles, filled: current.length, round: round + 1 };
}

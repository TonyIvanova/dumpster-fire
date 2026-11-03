import { Note } from '../core/note';
import { PICTURE, PICTURE_SIZE, PICTURE_TILES, buildPicture } from './picture';

function notes(count: number): Note[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    text: `Note ${i}`,
    pages: 1,
    createdAt: 1000 + i,
    updatedAt: 1000 + i,
    driveId: null,
    syncedAt: 0,
  }));
}

describe('buildPicture', () => {
  it('has an exact 25 by 25 picture with a colour for every square', () => {
    expect(PICTURE.length).toBe(PICTURE_SIZE);
    for (const row of PICTURE) expect(row.length).toBe(PICTURE_SIZE);
    const { tiles } = buildPicture([]);
    expect(tiles.length).toBe(PICTURE_TILES);
    for (const tile of tiles) expect(tile.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('starts empty', () => {
    const picture = buildPicture([]);
    expect(picture.filled).toBe(0);
    expect(picture.round).toBe(1);
    expect(picture.tiles.every((tile) => tile.note === null)).toBe(true);
  });

  it('piles up from the bottom left, oldest first', () => {
    const { tiles } = buildPicture(notes(27).reverse());
    const at = (y: number, x: number) => tiles[y * PICTURE_SIZE + x];
    expect(at(24, 0).note?.id).toBe('n0');
    expect(at(24, 24).note?.id).toBe('n24');
    expect(at(23, 0).note?.id).toBe('n25');
    expect(at(23, 1).note?.id).toBe('n26');
    expect(at(23, 1).newest).toBe(true);
    expect(at(23, 2).note).toBeNull();
    expect(tiles.filter((tile) => tile.newest).length).toBe(1);
  });

  it('stays full on the last square, then starts the next round', () => {
    const full = buildPicture(notes(PICTURE_TILES));
    expect(full.filled).toBe(PICTURE_TILES);
    expect(full.round).toBe(1);

    const next = buildPicture(notes(PICTURE_TILES + 1));
    expect(next.filled).toBe(1);
    expect(next.round).toBe(2);
    expect(next.tiles[24 * PICTURE_SIZE].note?.id).toBe(`n${PICTURE_TILES}`);
  });
});

export interface Note {
  id: string;
  text: string;
  pages: number;
  createdAt: number;
  updatedAt: number;
  driveId: string | null;
  syncedAt: number;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function titleOf(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.trim().slice(0, 60) || 'Untitled';
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function download(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

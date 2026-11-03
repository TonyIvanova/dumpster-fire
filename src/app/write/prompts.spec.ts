import { PROMPTS, randomPrompt } from './prompts';

describe('prompts', () => {
  it('has 100 different one-word prompts', () => {
    expect(PROMPTS.length).toBe(100);
    expect(new Set(PROMPTS.map((word) => word.toLowerCase())).size).toBe(100);
    for (const word of PROMPTS) expect(word).toMatch(/^[A-Z][a-z]+$/);
  });

  it('fits between the clock and the page number on a phone', () => {
    for (const word of PROMPTS) expect(word.length).toBeLessThanOrEqual(10);
  });

  it('never repeats the word you asked to replace', () => {
    for (let i = 0; i < 500; i++) expect(randomPrompt('Rain')).not.toBe('Rain');
  });
});

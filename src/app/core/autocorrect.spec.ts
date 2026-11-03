import { correct, correctWithContext } from './autocorrect';

const cases: [string, string, string][] = [
  ['fixes a typo', 'And teh ', 'And the '],
  ['keeps capitals', 'And TEH ', 'And THE '],
  ['keeps a leading capital', 'So. Teh ', 'So. The '],
  ['adds apostrophes', 'I dont ', "I don't "],
  ['works before punctuation', 'I saw teh,', 'I saw the,'],
  ['capitalizes the first word', 'hello ', 'Hello '],
  ['capitalizes after a full stop', 'Done. next ', 'Done. Next '],
  ['capitalizes after a new line', 'Done\nnext ', 'Done\nNext '],
  ['capitalizes Cyrillic', 'Да. привет ', 'Да. Привет '],
  ['leaves abbreviations alone', 'Fruit, e.g. apples ', 'Fruit, e.g. apples '],
  ['leaves domains alone', 'See example.com ', 'See example.com '],
  ['capitalizes I', 'And i ', 'And I '],
  ["capitalizes I'm", "And i'm ", "And I'm "],
  ['fixes should of', 'I should of ', 'I should have '],
  ['removes a doubled the', 'See the the ', 'See the '],
  ['leaves had had alone', 'She had had ', 'She had had '],
  ['a to an', 'Eat a apple ', 'Eat an apple '],
  ['a to an before a silent h', 'Wait a hour ', 'Wait an hour '],
  ['leaves a user alone', 'Ask a user ', 'Ask a user '],
  ['leaves a university alone', 'At a university ', 'At a university '],
  ['collapses double spaces', 'Word  ', 'Word '],
  ['removes a space before a comma', 'Word ,', 'Word,'],
  ['ignores mid-word typing', 'Teh', 'Teh'],
  ['leaves correct text alone', 'This is fine. ', 'This is fine. '],
];

describe('correct', () => {
  for (const [name, input, expected] of cases) {
    it(name, () => expect(correct(input)).toBe(expected));
  }
});

describe('correctWithContext', () => {
  it('page context stops a false capital', () => {
    expect(correctWithContext('and then ', 'we ')).toBe('we ');
  });

  it('page context allows a real capital', () => {
    expect(correctWithContext('It ended. ', 'we ')).toBe('We ');
  });

  it('drops a fix reaching over the page break', () => {
    expect(correctWithContext('Eat a ', 'apple ')).toBe('apple ');
  });

  it('removes a word doubled over the page break', () => {
    expect(correctWithContext('See the ', 'the ')).toBe('');
  });
});

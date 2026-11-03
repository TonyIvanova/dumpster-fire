// Small, offline, and only ever touches the word you just finished.

const TYPOS: Record<string, string> = {
  acommodate: 'accommodate', accomodate: 'accommodate', acheive: 'achieve', acknowlege: 'acknowledge',
  adress: 'address', agian: 'again', alot: 'a lot', alwasy: 'always',
  amoung: 'among', apparantly: 'apparently', aroud: 'around', arguement: 'argument', basicly: 'basically',
  becasue: 'because', becuase: 'because', beacuse: 'because', befor: 'before', begining: 'beginning',
  beleive: 'believe', belive: 'believe', buisness: 'business', calender: 'calendar', cant: "can't",
  certianly: 'certainly', chnage: 'change', collegue: 'colleague', comming: 'coming', commitee: 'committee',
  completly: 'completely', concious: 'conscious', couldnt: "couldn't", definately: 'definitely',
  definitly: 'definitely', diffrent: 'different', didnt: "didn't", dissapear: 'disappear',
  dissapoint: 'disappoint', doesnt: "doesn't", dont: "don't", embarass: 'embarrass', enviroment: 'environment',
  eveyr: 'every', exellent: 'excellent', experiance: 'experience', familar: 'familiar', finaly: 'finally',
  firends: 'friends', firend: 'friend', foriegn: 'foreign', freind: 'friend', freinds: 'friends',
  fromt: 'from', goign: 'going', goverment: 'government', grammer: 'grammar', greatful: 'grateful',
  gaurd: 'guard', happend: 'happened', hasnt: "hasn't", havent: "haven't", heigth: 'height',
  hte: 'the', humerous: 'humorous', idae: 'idea', immediatly: 'immediately', independant: 'independent',
  interupt: 'interrupt', isnt: "isn't", jsut: 'just', knowlege: 'knowledge', liek: 'like', littel: 'little',
  mispell: 'misspell', mkae: 'make', neccessary: 'necessary', necesary: 'necessary', noticable: 'noticeable',
  occured: 'occurred', ocurred: 'occurred', occassion: 'occasion', onyl: 'only', peice: 'piece',
  peopel: 'people', probaly: 'probably', probly: 'probably', publically: 'publicly', realy: 'really',
  recieve: 'receive', recomend: 'recommend', remeber: 'remember', rember: 'remember', seperate: 'separate',
  shouldnt: "shouldn't", sincerly: 'sincerely', somthing: 'something', succesful: 'successful',
  suprise: 'surprise', taht: 'that', teh: 'the', thier: 'their', thnig: 'thing', thigns: 'things',
  thsi: 'this', tihs: 'this', tommorow: 'tomorrow', tomorow: 'tomorrow', tounge: 'tongue', truely: 'truly',
  tyhat: 'that', untill: 'until', usualy: 'usually', waht: 'what', wasnt: "wasn't", wierd: 'weird',
  whcih: 'which', wich: 'which', wihch: 'which', wiht: 'with', whith: 'with', wont: "won't",
  woudl: 'would', wouldnt: "wouldn't", writting: 'writing', yuo: 'you', youre: "you're",
};

const PHRASES: [RegExp, string][] = [
  [/\b(should|could|would|must|might) of$/i, '$1 have'],
  [/\byour welcome$/i, "you're welcome"],
  [/\b(the) \1$/i, '$1'],
  [/\b(and) \1$/i, '$1'],
  [/\b(of) \1$/i, '$1'],
  [/\b(to) \1$/i, '$1'],
];

// "a user" and "an hour" don't follow the spelling, so stay out of the way of the usual suspects.
const CONSONANT_SOUND = /^(uni|use|usu|usa|uti|eu|one|once|ubi|ura)/i;
const VOWEL_SOUND = /^(hour|honest|honor|honour|heir)/i;
const NOT_A_SENTENCE_END = /(?:^|\s)(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr)\.\s*$/i;

function matchCase(original: string, fixed: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return fixed.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
  return fixed;
}

function atSentenceStart(before: string): boolean {
  if (NOT_A_SENTENCE_END.test(before)) return false;
  return /(^|[.!?…]["'”’)]*\s+|\n\s*)$/.test(before);
}

// Takes everything up to the caret, ending in the boundary character just typed.
// Returns the corrected text, or the same string when there's nothing to do.
export function correct(text: string): string {
  const boundary = text.at(-1);
  if (!boundary || !/[\s.,!?;:]/.test(boundary)) return text;

  // Two spaces in a row, or a space before punctuation.
  if (boundary === ' ' && text.at(-2) === ' ') return text.slice(0, -1);
  if (/[.,!?;:]/.test(boundary) && text.at(-2) === ' ') text = text.slice(0, -2) + boundary;

  const found = text.slice(0, -1).match(/[\p{L}\p{M}\p{N}'’]+$/u);
  if (!found) return text;

  let head = text.slice(0, -1 - found[0].length);
  let word = found[0];

  const typo = TYPOS[word.toLowerCase()];
  if (typo) word = matchCase(word, typo);

  if (word === 'i') word = 'I';
  else if (/^i['’](m|ve|ll|d)$/.test(word)) word = 'I' + word.slice(1);

  if (/^\p{Ll}/u.test(word) && !/\d/.test(word) && atSentenceStart(head)) {
    word = word[0].toLocaleUpperCase() + word.slice(1);
  }

  let tail = head + word;
  for (const [pattern, replacement] of PHRASES) {
    if (pattern.test(tail)) { tail = tail.replace(pattern, replacement); break; }
  }

  const article = tail.match(/(^|\s)([Aa]n?) ([\p{L}]+)$/u);
  if (article) {
    const [, lead, a, next] = article;
    const vowel = (/^[aeiou]/i.test(next) && !CONSONANT_SOUND.test(next)) || VOWEL_SOUND.test(next);
    const fixed = vowel ? a[0] + 'n' : a[0];
    // Only "a" → "an". Taking the n off is a guess too many ("an FBI agent").
    if (fixed !== a && vowel) {
      tail = tail.slice(0, article.index) + lead + fixed + ' ' + next;
    }
  }

  return tail + boundary;
}

// Same as correct(), but `context` (the end of the previous page) only informs the
// decisions. If a fix would reach back past the page break, leave it alone.
export function correctWithContext(context: string, text: string): string {
  const fixed = correct(context + text);
  return fixed.startsWith(context) ? fixed.slice(context.length) : text;
}

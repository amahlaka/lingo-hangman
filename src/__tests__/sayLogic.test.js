import { allowedMisses, checkSaid, similarity, speechTokens } from '../games/say/sayLogic';

describe('speechTokens', () => {
  it('lowercases, drops punctuation and spells out numbers and contractions', () => {
    expect(speechTokens("I'm 2 Happy!")).toEqual(['i', 'am', 'two', 'happy']);
    expect(speechTokens('Don’t worry.')).toEqual(['do', 'not', 'worry']);
    expect(speechTokens('ice-cream')).toEqual(['ice', 'cream']);
  });
});

describe('checkSaid', () => {
  it('accepts the word in any alternative, with extra words around it', () => {
    expect(checkSaid('dog', ['duck', 'the dog']).matched).toBe(true);
    expect(checkSaid('Dog', ['um dog.']).heard).toBe('um dog.');
  });

  it('treats homophones, digits and spelling variants as the same', () => {
    expect(checkSaid('four', ['for']).matched).toBe(true);
    expect(checkSaid('two', ['2']).matched).toBe(true);
    expect(checkSaid('colour', ['color']).matched).toBe(true);
    expect(checkSaid("I'm fine", ['I am fine']).matched).toBe(true);
  });

  it('does not accept a different word, but says when it was close', () => {
    const r = checkSaid('three', ['tree']);
    expect(r.matched).toBe(false);
    expect(r.close).toBe(true);
    expect(checkSaid('three', ['banana']).close).toBe(false);
  });

  it('marks which words of a phrase were heard', () => {
    const r = checkSaid('How are you', ['how old you']);
    expect(r.matched).toBe(false);
    expect(r.words).toEqual([
      { text: 'How', ok: true },
      { text: 'are', ok: false },
      { text: 'you', ok: true },
    ]);
  });

  it('lets a longer phrase miss one word in four', () => {
    expect(allowedMisses(3)).toBe(0);
    expect(allowedMisses(4)).toBe(1);
    expect(checkSaid('see you next week', ['see you text week']).matched).toBe(true);
  });

  it('reports nothing heard for empty results', () => {
    expect(checkSaid('dog', []).matched).toBe(false);
    expect(checkSaid('dog', ['']).heard).toBe('');
  });

  it('scores similarity between 0 and 1', () => {
    expect(similarity('see', 'sea')).toBe(1);
    expect(similarity('cat', 'cut')).toBeCloseTo(2 / 3);
  });
});

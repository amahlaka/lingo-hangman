import grammar from '../content/grammar.json';
import confusables from '../content/confusables.json';
import { GAP, buildGapRound, fillGap, gapQuestions, maxMissesFor, splitGap } from '../games/gap/gapLogic';

const files = { grammar, confusables };

describe.each(Object.entries(files))('%s content', (name, content) => {
  it('has unique set ids and both languages for every rule', () => {
    const ids = content.sets.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    content.sets.forEach((set) => {
      expect(set.title && set.titleFi).toBeTruthy();
      expect(set.rule.en && set.rule.fi).toBeTruthy();
      expect(set.items.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('has one gap, a valid answer and a Finnish translation in every item', () => {
    content.sets.forEach((set) =>
      set.items.forEach((item) => {
        const where = `${set.id}: ${item.text}`;
        expect([where, item.text.split(GAP).length - 1]).toEqual([where, 1]);
        const options = item.options || set.options;
        expect([where, options.length >= 2, new Set(options).size === options.length]).toEqual([where, true, true]);
        expect([where, options.includes(item.answer)]).toEqual([where, true]);
        expect([where, Boolean(item.fi)]).toEqual([where, true]);
        if (item.why) expect([where, Boolean(item.why.en && item.why.fi)]).toEqual([where, true]);
      })
    );
  });
});

describe('gap helpers', () => {
  it('fills the gap, closes up an empty answer and capitalises the start', () => {
    expect(fillGap('I love ___ music.', '')).toBe('I love music.');
    expect(fillGap('___ cats sleep a lot.', '')).toBe('Cats sleep a lot.');
    expect(fillGap('___ sun is bright.', 'the')).toBe('The sun is bright.');
    expect(fillGap('Can I ___ your pen?', 'borrow')).toBe('Can I borrow your pen?');
    expect(splitGap('Can I ___ your pen?')).toEqual({ before: 'Can I ', after: ' your pen?' });
  });

  it('ends a two-option question after one miss', () => {
    expect(maxMissesFor(['a', 'an'])).toBe(1);
    expect(maxMissesFor(['in', 'on', 'at'])).toBe(2);
    expect(maxMissesFor(['a', 'b', 'c', 'd'])).toBe(2);
  });

  it('spreads a round over the sets', () => {
    const round = buildGapRound(confusables, { count: 10 });
    expect(round).toHaveLength(10);
    expect(new Set(round.map((q) => q.setId)).size).toBe(10);
    expect(new Set(round.map((q) => q.id)).size).toBe(10);
  });

  it('limits a round to one set when asked, and ignores an unknown set', () => {
    const round = buildGapRound(confusables, { setId: 'borrow-lend' });
    expect(round.every((q) => q.setId === 'borrow-lend')).toBe(true);
    expect(buildGapRound(confusables, { setId: 'nope' })).toHaveLength(10);
  });

  it('carries the set rule and the item note into each question', () => {
    const q = gapQuestions(grammar).find((x) => x.text === 'We waited for ___ hour.');
    expect(q.sentence).toBe('We waited for an hour.');
    expect(q.rule.fi).toMatch(/vokaali/);
    expect(q.why.fi).toMatch(/hour/);
  });
});

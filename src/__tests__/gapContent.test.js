import grammar from '../content/grammar.json';
import confusables from '../content/confusables.json';
import { GAP, buildGapRound, fillGap, gapQuestions, maxMissesFor, splitGap } from '../games/gap/gapLogic';

const files = { grammar, confusables };

describe.each(Object.entries(files))('%s content', (name, content) => {
  const topics = content.items.filter((i) => i.type !== 'gap');
  const gaps = content.items.filter((i) => i.type === 'gap');

  it('has unique ids and both languages for every topic', () => {
    const ids = content.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    topics.forEach((t) => {
      expect(['rule', 'confusable']).toContain(t.type);
      expect(t.title.en && t.title.fi).toBeTruthy();
      expect(t.explanation.en && t.explanation.fi).toBeTruthy();
      expect(gaps.filter((g) => g.topic === t.id).length).toBeGreaterThanOrEqual(4);
    });
  });

  it('has one gap, a known topic, distinct options and a Finnish translation in every sentence', () => {
    const topicIds = topics.map((t) => t.id);
    gaps.forEach((g) => {
      const where = g.id;
      expect([where, g.sentence.split(GAP).length - 1]).toEqual([where, 1]);
      expect([where, topicIds.includes(g.topic)]).toEqual([where, true]);
      expect([where, g.answers.length]).toEqual([where, 1]);
      const options = [...g.answers, ...g.distractors];
      expect([where, g.distractors.length >= 1, new Set(options).size === options.length]).toEqual([where, true, true]);
      expect([where, Boolean(g.translation.fi)]).toEqual([where, true]);
      if (g.explanation) expect([where, Boolean(g.explanation.en && g.explanation.fi)]).toEqual([where, true]);
    });
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

  it('spreads a round over the topics', () => {
    const round = buildGapRound(confusables, { count: 10 });
    expect(round).toHaveLength(10);
    expect(new Set(round.map((q) => q.setId)).size).toBe(10);
    expect(new Set(round.map((q) => q.id)).size).toBe(10);
  });

  it('limits a round to one topic when asked, and ignores an unknown one', () => {
    const round = buildGapRound(confusables, { setId: 'borrow-lend' });
    expect(round.every((q) => q.setId === 'borrow-lend')).toBe(true);
    expect(buildGapRound(confusables, { setId: 'nope' })).toHaveLength(10);
  });

  it('carries the topic rule and the sentence note into each question', () => {
    const q = gapQuestions(grammar).find((x) => x.text === 'We waited for ___ hour.');
    expect(q.sentence).toBe('We waited for an hour.');
    expect(q.options).toEqual(['an', 'a']);
    expect(q.rule.fi).toMatch(/vokaali/);
    expect(q.why.fi).toMatch(/hour/);
  });
});

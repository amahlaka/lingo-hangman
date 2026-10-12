import { getGapItems, getTopics } from '../lib/words';
import { GAP, buildGapRound, fillGap, gapQuestions, maxMissesFor, splitGap } from '../games/gap/gapLogic';

const bank = (type) => ({ topics: getTopics(type), gaps: getGapItems() });

describe.each([['rule'], ['confusable']])('word bank %s topics', (type) => {
  const content = bank(type);
  const questions = gapQuestions(content);

  it('each have enough sentences for a round on their own', () => {
    expect(content.topics.length).toBeGreaterThan(0);
    content.topics.forEach((t) => {
      expect([t.id, questions.filter((q) => q.setId === t.id).length >= 4]).toEqual([t.id, true]);
      expect([t.id, Boolean(t.explanation?.en && t.explanation?.fi)]).toEqual([t.id, true]);
    });
  });

  it('give every question one gap, distinct options and a Finnish translation', () => {
    questions.forEach((q) => {
      expect([q.id, q.text.split(GAP).length - 1]).toEqual([q.id, 1]);
      expect([q.id, q.options.length >= 2, new Set(q.options).size === q.options.length]).toEqual([q.id, true, true]);
      expect([q.id, Boolean(q.fi)]).toEqual([q.id, true]);
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

  it('only uses sentences on the given topics', () => {
    const topics = [{ id: 't', title: { en: 'T', fi: 'T' }, explanation: { en: 'e', fi: 'f' } }];
    const gaps = [
      { id: 'a', topic: 't', sentence: 'I ___ it.', answers: ['like'], distractors: ['likes'], translation: { fi: 'Pidän siitä.' } },
      { id: 'b', topic: 'other', sentence: 'I ___ it.', answers: ['x'], distractors: ['y'], translation: { fi: '-' } },
    ];
    const qs = gapQuestions({ topics, gaps });
    expect(qs.map((q) => q.id)).toEqual(['a']);
    expect(qs[0]).toMatchObject({ options: ['like', 'likes'], sentence: 'I like it.', rule: { en: 'e', fi: 'f' }, why: null });
  });

  it('spreads a round over the topics', () => {
    const round = buildGapRound(bank('confusable'), { count: 10 });
    expect(round).toHaveLength(10);
    expect(new Set(round.map((q) => q.setId)).size).toBe(10);
  });

  it('limits a round to one topic when asked, and ignores an unknown one', () => {
    const round = buildGapRound(bank('confusable'), { setId: 'borrow-lend' });
    expect(round.length).toBeGreaterThan(0);
    expect(round.every((q) => q.setId === 'borrow-lend')).toBe(true);
    expect(buildGapRound(bank('confusable'), { setId: 'nope' })).toHaveLength(10);
  });
});

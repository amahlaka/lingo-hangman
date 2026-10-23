import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { getItem, getTexts } from '../lib/words';
import { validateItem } from '../lib/contentSchema';
import { spokenTexts, clipKey } from '../lib/speechClips';
import { getContent } from '../lib/content';
import { buildStoryRound, isStoryText, storyAsks, storyPieces, storyQuestion } from '../games/story/storyLogic';

beforeEach(() => localStorage.clear());

const story = {
  id: 'early', type: 'text', kind: 'story', title: { en: 'Early', fi: 'Aikaisin' },
  sentences: [
    { en: 'Laura gets up early, at six.', fi: 'Laura herää aikaisin, kuudelta.', parts: [
      { en: 'Laura' },
      { en: 'gets up', fi: 'herää', wrong: ['menee nukkumaan', 'istuu alas'] },
      { en: 'early', fi: 'aikaisin', wrong: ['myöhään'] },
      { en: 'at six', fi: 'kuudelta', wrong: ['seitsemältä'] },
    ] },
    { en: 'Then she eats.', fi: 'Sitten hän syö.' },
  ],
};

describe('Story words logic', () => {
  it('cuts a sentence at its parts and keeps the punctuation', () => {
    expect(storyPieces(story.sentences[0]).map((p) => p.text)).toEqual(['Laura', 'gets up', 'early,', 'at six.']);
    expect(storyPieces(story.sentences[1])).toEqual([{ text: 'Then she eats.' }]);
    // Parts that don't make the sentence show it whole.
    expect(storyPieces({ en: 'She runs.', parts: [{ en: 'She walks', fi: 'x', wrong: ['y'] }] })).toEqual([{ text: 'She runs.' }]);
  });

  it('asks every part with a meaning, with two or three options', () => {
    const q = storyQuestion(story);
    expect(storyAsks(q)).toEqual([[0, 1], [0, 2], [0, 3]]);
    const gets = q.sentences[0].pieces[1];
    expect(gets.options.sort()).toEqual(['herää', 'istuu alas', 'menee nukkumaan']);
    expect(q.sentences[0].pieces[2].options.length).toBe(2);
    expect(isStoryText(story)).toBe(true);
    expect(isStoryText({ ...story, sentences: [story.sentences[1], story.sentences[1]] })).toBe(false);
  });

  it('turns every word bank story with parts into a round', () => {
    const texts = getTexts().filter(isStoryText);
    expect(texts.length).toBeGreaterThan(0);
    const round = buildStoryRound(texts, { count: texts.length });
    expect(round.length).toBe(texts.length);
    round.forEach((q) => {
      q.sentences.forEach((s) => {
        // Every part found its place in the sentence as written.
        expect(s.pieces.map((p) => p.text).join(' ')).toBe(s.en.trim().split(/\s+/).join(' '));
        s.pieces.filter((p) => p.fi).forEach((p) => {
          expect(p.options).toContain(p.fi);
          expect(p.options.length).toBeGreaterThanOrEqual(2);
          expect(p.options.length).toBeLessThanOrEqual(3);
        });
      });
    });
  });

  it('checks the parts in the word base', () => {
    expect(validateItem(story)).toEqual([]);
    const withParts = (parts) => ({ ...story, sentences: [{ ...story.sentences[0], parts }, story.sentences[1]] });
    expect(validateItem(withParts([{ en: 'Laura gets up early' }, { en: 'at six', fi: 'kuudelta', wrong: ['kuudelta'] }])).join())
      .toMatch(/"kuudelta" is also a wrong meaning/);
    expect(validateItem(withParts([{ en: 'Laura gets up late at six', fi: 'x', wrong: ['y'] }])).join()).toMatch(/not the sentence/);
    expect(validateItem(withParts([{ en: 'Laura gets up early at six' }])).join()).toMatch(/no part with fi/);
    expect(validateItem(withParts([{ en: 'Laura gets up early at six', fi: 'x', wrong: ['a', 'b', 'c'] }])).join()).toMatch(/give one or two/);
    expect(validateItem(withParts([{ en: 'Laura', wrong: ['a'] }, { en: 'gets up early at six', fi: 'x', wrong: ['y'] }])).join()).toMatch(/wrong is only for a part with fi/);
  });

  it('has a recorded clip for every asked part', () => {
    const keys = spokenTexts(getContent().raw, 'en');
    const text = getTexts().find(isStoryText);
    text.sentences.flatMap((s) => s.parts || []).filter((p) => p.fi).forEach((p) => {
      expect(keys.has(clipKey(p.en))).toBe(true);
    });
  });
});

describe('Story words', () => {
  const group = () => screen.getByRole('group', { name: 'Finnish meanings to choose from' });

  it('reads a story part by part and shows each meaning under its part', () => {
    const { storage } = renderApp('/story?set=my-morning');
    const text = getItem('my-morning');
    const parts = text.sentences.flatMap((s) => s.parts.filter((p) => p.fi));
    expect(screen.getByText(`1 of ${parts.length}`)).toBeInTheDocument();
    // Only the first sentence is shown at first.
    expect(screen.queryByText(text.sentences[1].parts[0].en)).not.toBeInTheDocument();

    // A wrong pick first, then the right one.
    fireEvent.click(within(group()).getByRole('button', { name: parts[0].wrong[0] }));
    expect(screen.getByText('Not this one. Read the whole sentence again.')).toBeInTheDocument();
    fireEvent.click(within(group()).getByRole('button', { name: parts[0].fi }));
    expect(screen.getByText(parts[0].fi)).toHaveAttribute('lang', 'fi');

    parts.slice(1).forEach((p, i) => {
      if (i === 2) expect(screen.getByText(text.sentences[0].fi)).toBeInTheDocument();
      fireEvent.click(within(group()).getByRole('button', { name: p.fi }));
    });
    expect(screen.getByText('Story done.')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${parts.length - 1} of ${parts.length} meanings right on the first try`))).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain('gets up');
  });

  it('has a card on Home', () => {
    renderApp('/');
    expect(screen.getAllByText('Story words').length).toBeGreaterThan(0);
  });
});

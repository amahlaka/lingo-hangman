import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { getItem, getSentences, getTexts } from '../lib/words';
import { validateItem } from '../lib/contentSchema';
import { spokenTexts, clipKey } from '../lib/speechClips';
import { getContent } from '../lib/content';
import { buildStoryRound, isStoryText, storyAsks, storyQuestion } from '../games/story/storyLogic';

beforeEach(() => localStorage.clear());

const story = {
  id: 'fox', type: 'text', kind: 'story', title: { en: 'Fox', fi: 'Kettu' },
  source: { en: 'Adapted from Aesop.' },
  sentences: [
    { en: 'A hungry fox saw some grapes.', fi: 'Nälkäinen kettu näki rypäleitä.', phrases: [
      { en: 'A hungry fox saw', fi: 'Nälkäinen kettu näki', wrong: ['Väsynyt kettu näki', 'Nälkäinen kettu söi'] },
      { en: 'some grapes.', fi: 'rypäleitä.', wrong: ['kirsikoita.'] },
    ] },
    { en: 'They were sour.', fi: 'Ne olivat happamia.', phrases: [{ en: 'They were sour.', fi: 'Ne olivat happamia.', wrong: ['Ne olivat makeita.'] }] },
  ],
};

describe('Translate the story logic', () => {
  it('asks every phrase with two or three options', () => {
    const q = storyQuestion(story);
    expect(storyAsks(q)).toEqual([[0, 0], [0, 1], [1, 0]]);
    expect([...q.sentences[0].phrases[0].options].sort()).toEqual(['Nälkäinen kettu näki', 'Nälkäinen kettu söi', 'Väsynyt kettu näki']);
    expect(q.sentences[0].phrases[1].options.length).toBe(2);
    expect(isStoryText(story)).toBe(true);
    // Every sentence needs its phrases.
    expect(isStoryText({ ...story, sentences: [story.sentences[0], { en: 'They were sour.', fi: 'Ne olivat happamia.' }] })).toBe(false);
  });

  it('turns every word base story with phrases into a round', () => {
    const texts = getTexts().filter(isStoryText);
    expect(texts.length).toBeGreaterThan(2);
    const round = buildStoryRound(texts, { count: texts.length });
    expect(round.length).toBe(texts.length);
    round.forEach((q) => q.sentences.forEach((s) => s.phrases.forEach((p) => {
      expect(p.options).toContain(p.fi);
      expect(p.options.length).toBeGreaterThanOrEqual(2);
      expect(p.options.length).toBeLessThanOrEqual(3);
    })));
  });

  it('checks the phrases in the word base', () => {
    expect(validateItem(story)).toEqual([]);
    const withPhrases = (phrases, extra = {}) => ({ ...story, sentences: [{ ...story.sentences[0], ...extra, phrases }, story.sentences[1]] });
    const one = (p) => validateItem(withPhrases([p])).join();
    expect(one({ en: 'A hungry fox saw some grapes.', fi: 'Nälkäinen kettu näki rypäleitä.', wrong: ['Nälkäinen kettu näki rypäleitä.'] })).toMatch(/also a wrong translation/);
    expect(one({ en: 'A fox saw some grapes.', fi: 'Nälkäinen kettu näki rypäleitä.', wrong: ['x'] })).toMatch(/not the sentence "A hungry/);
    expect(one({ en: 'A hungry fox saw some grapes.', fi: 'Kettu näki rypäleitä.', wrong: ['x'] })).toMatch(/not the sentence "Nälkäinen/);
    expect(one({ en: 'A hungry fox saw some grapes.', fi: 'Nälkäinen kettu näki rypäleitä.', wrong: ['a', 'b', 'c'] })).toMatch(/give one or two/);
    expect(one({ en: 'A hungry fox saw some grapes.', wrong: ['a'] })).toMatch(/fi is empty/);
    expect(validateItem({ ...story, source: { fi: 'Aisopos' } }).join()).toMatch(/source needs "en"/);
  });

  it('keeps classic sentences out of the everyday sentence games and gives each phrase a clip', () => {
    const text = getTexts().find(isStoryText);
    const learning = new Set(getSentences().map((s) => s.learning));
    text.sentences.forEach((s) => expect(learning.has(s.en)).toBe(false));
    const keys = spokenTexts(getContent().raw, 'en');
    text.sentences.flatMap((s) => s.phrases).forEach((p) => expect(keys.has(clipKey(p.en))).toBe(true));
  });
});

describe('Translate the story', () => {
  const options = () => screen.getByRole('group', { name: 'Finnish translations to choose from' });

  it('builds the Finnish translation phrase by phrase', () => {
    const { storage } = renderApp('/story?set=the-fox-and-the-grapes');
    const text = getItem('the-fox-and-the-grapes');
    const phrases = text.sentences.flatMap((s) => s.phrases);
    expect(screen.getByText(`Phrase 1 of ${phrases.length}`)).toBeInTheDocument();
    expect(screen.getByText(/Adapted from Aesop/)).toBeInTheDocument();
    // Only the first sentence is shown at first.
    expect(screen.queryByRole('button', { name: text.sentences[1].phrases[0].en })).not.toBeInTheDocument();

    // A wrong pick first, then the right one, which goes into the translation.
    fireEvent.click(within(options()).getByRole('button', { name: phrases[0].wrong[0] }));
    expect(screen.getByText('Not this one. Read the whole sentence again.')).toBeInTheDocument();
    fireEvent.click(within(options()).getByRole('button', { name: phrases[0].fi }));
    expect(within(screen.getByLabelText('Your translation so far')).getByText(phrases[0].fi)).toBeInTheDocument();

    phrases.slice(1).forEach((p) => fireEvent.click(within(options()).getByRole('button', { name: p.fi })));
    expect(screen.getByRole('button', { name: `Hear: ${text.sentences[0].en}` })).toHaveTextContent(text.sentences[0].fi);
    expect(screen.getByText('Story translated.')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${phrases.length - 1} of ${phrases.length} phrases right on the first try`))).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain('en:a hungry fox saw');
    expect(JSON.stringify(storage.data)).not.toContain('a vine.');
  });

  it('has a card on Home', () => {
    renderApp('/');
    expect(screen.getAllByText('Translate the story').length).toBeGreaterThan(0);
  });
});

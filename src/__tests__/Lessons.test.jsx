import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, screen } from '@testing-library/react';
import { renderApp } from '../test-utils';
import bundled from '../lib/bundledContent';
import { setContent } from '../lib/content';
import { validateContent, validateItem } from '../lib/contentSchema';
import { getLessons, lessonsFor } from '../lib/words';
import { GAMES } from '../games/registry';
import { splitMarks, plainWords } from '../app/LessonBlocks';

// A chapter and two lessons of their own, so the tests don't depend on what
// the word base holds. They link to a sound lesson the bundled content has.
const soundId = bundled.packs.flatMap((p) => p.items).find((i) => i.type === 'sound').id;
const chapter = { id: 'test-basics', title: { en: 'Test basics', fi: 'Testiperusteet' } };
const first = {
  id: 'test-lesson-ck', type: 'lesson', chapter: 'test-basics',
  title: { en: 'Test ck or k', fi: 'Testi ck vai k' },
  summary: { en: 'Back or book.', fi: 'Back vai book.' },
  blocks: [
    { type: 'text', text: { en: 'Look at the letters before *k*.', fi: 'Katso kirjaimia ennen *k*:ta.' } },
    { type: 'choice', question: { en: 'What comes before it?', fi: 'Mitä on ennen?' }, options: [
      { answer: { en: 'One short vowel', fi: 'Yksi lyhyt vokaali' }, result: 'ck', words: ['ba[ck]'] },
      { answer: { en: 'Anything else', fi: 'Jotain muuta' }, result: { en: 'just k', fi: 'pelkkä k' }, words: ['boo[k]'] },
    ] },
    { type: 'remember', text: { en: 'c before k.', fi: 'c ennen k:ta.' } },
    { type: 'letters', rows: [{ letters: 'j', sound: { en: 'like dž', fi: 'kuin dž' }, words: ['[j]ob'] }] },
    { type: 'compare', columns: [
      { title: { en: 'Finnish', fi: 'Suomi' }, lang: 'fi', lines: ['[Koira] puree.'] },
      { title: { en: 'English', fi: 'Englanti' }, lang: 'en', lines: ['[The dog] bites.'] },
    ] },
    { type: 'stress', words: ['ho·[tel]'] },
    { type: 'sentence', en: 'It is raining.', fi: 'Sataa.', wordTypes: ['pronoun:subject', 'auxiliary', 'verb'] },
    { type: 'words', words: ['thr[ough]'] },
  ],
  practice: [{ game: 'sounds', set: soundId }, { game: 'type-it' }],
};
const second = {
  id: 'test-lesson-two', type: 'lesson', chapter: 'test-basics',
  title: { en: 'Test second lesson', fi: 'Testin toinen oppitunti' },
  blocks: [{ type: 'text', text: { en: 'Second.', fi: 'Toinen.' } }],
};
const pack = { id: 'test-lessons', title: { en: 'Test lessons' }, items: [first, second] };
const raw = {
  ...bundled,
  index: { ...bundled.index, packs: [...bundled.index.packs, pack.id], lessonChapters: [chapter] },
  packs: [...bundled.packs.filter((p) => p.id !== 'lessons'), pack],
};

beforeAll(() => setContent(raw));
afterAll(() => setContent(bundled));
beforeEach(() => localStorage.clear());

describe('lesson items', () => {
  test('the test lessons pass the checks', () => {
    expect(validateContent(raw).filter((p) => p.includes('test-'))).toEqual([]);
  });

  test('broken blocks and links are reported', () => {
    const ctx = { practiceSetIds: new Set([soundId]) };
    const problems = validateItem({
      id: 'bad', type: 'lesson', chapter: 'test-basics', title: { en: 'Bad' },
      blocks: [
        { type: 'picture' },
        { type: 'stress', words: ['hotel'] },
        { type: 'words', words: ['ba[ck'] },
        { type: 'choice', question: { en: 'Q' }, options: [{ answer: { en: 'a' }, result: 'x', words: ['x'] }] },
        { type: 'sentence', en: 'It rains.', wordTypes: ['pronoun:subject'] },
      ],
      practice: [{ game: 'sounds', set: 'no-such-lesson' }],
    }, ctx);
    expect(problems).toEqual(expect.arrayContaining([
      'title needs "fi"',
      expect.stringContaining('blocks[1].type must be one of'),
      expect.stringContaining('"hotel" needs its stressed syllable in brackets'),
      expect.stringContaining('"ba[ck" has an unpaired'),
      'blocks[4].options needs two or three options',
      expect.stringContaining('blocks[5].wordTypes has 1 entries'),
      expect.stringContaining('set "no-such-lesson"'),
    ]));
  });

  test('a lesson in an unknown chapter is reported', () => {
    const problems = validateContent({ ...raw, index: { ...raw.index, lessonChapters: [] } });
    expect(problems).toContain('packs/test-lessons.json: test-lesson-ck: chapter "test-basics" is not in index.json lessonChapters');
  });

  test('marks and syllables', () => {
    expect(splitMarks('[The dog] bites [the man].')).toEqual([
      { text: 'The dog', marked: true }, { text: ' bites ' }, { text: 'the man', marked: true }, { text: '.' },
    ]);
    expect(plainWords('ba·[na]·na')).toBe('banana');
  });

  test('lessonsFor finds the lesson that links to a game set', () => {
    expect(lessonsFor('sounds', soundId).map((l) => l.id)).toEqual(['test-lesson-ck']);
    expect(lessonsFor('sounds', 'other')).toEqual([]);
  });
});

describe('Lessons pages', () => {
  test('the list shows chapters and opens the first lesson', () => {
    renderApp('/lessons');
    expect(screen.getByRole('heading', { name: 'Test basics' })).toBeInTheDocument();
    expect(screen.getByText('Test second lesson')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Start with lesson 1' }));
    expect(screen.getByRole('heading', { name: 'Test ck or k' })).toBeInTheDocument();
  });

  test('a lesson draws its blocks, links to games and marks itself read', () => {
    renderApp('/lessons/test-lesson-ck');
    expect(screen.getByText('What comes before it?')).toBeInTheDocument();
    expect(screen.getByText('just k')).toBeInTheDocument();
    expect(screen.getByText('Remember')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hotel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The dog bites.' })).toBeInTheDocument();
    const sounds = GAMES.find((g) => g.id === 'sounds');
    expect(screen.getByRole('link', { name: new RegExp(sounds.name) })).toHaveAttribute('href', `/sounds?set=${soundId}`);
    expect(screen.getByRole('link', { name: 'Type it' })).toHaveAttribute('href', '/type-it');
    expect(JSON.parse(localStorage.getItem('lingoLessonsRead'))).toEqual(['test-lesson-ck']);
    expect(screen.getByRole('link', { name: 'Next: Test second lesson' })).toHaveAttribute('href', '/lessons/test-lesson-two');
  });

  test('the lesson can be read in Finnish', () => {
    renderApp('/lessons/test-lesson-ck');
    fireEvent.click(screen.getByRole('button', { name: 'Lue suomeksi' }));
    expect(screen.getByText('Mitä on ennen?')).toBeInTheDocument();
    expect(screen.getByText('pelkkä k')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read in English' })).toBeInTheDocument();
  });

  test('Home offers the next lesson once one is read', () => {
    localStorage.setItem('lingoLessonsRead', JSON.stringify(['test-lesson-ck']));
    renderApp('/');
    expect(screen.getByRole('link', { name: /Next: Test second lesson/ })).toHaveAttribute('href', '/lessons/test-lesson-two');
  });
});

// The word base's own lessons (in content/) link only to games that exist,
// and a `set` only to a game that takes that kind of item.
describe('word base lessons', () => {
  const SET_GAMES = { sound: ['sounds'], rule: ['grammar'], confusable: ['mixed-up'], text: ['read', 'talk'] };
  test('practice links point at real games', () => {
    setContent(bundled);
    const items = new Map(bundled.packs.flatMap((p) => p.items).map((i) => [i.id, i]));
    for (const lesson of getLessons()) {
      for (const link of lesson.practice || []) {
        const game = GAMES.find((g) => g.id === link.game);
        expect([lesson.id, game && !game.restricted && !game.featured]).toEqual([lesson.id, true]);
        if (link.set) expect([lesson.id, link.set, SET_GAMES[items.get(link.set)?.type]?.includes(link.game)]).toEqual([lesson.id, link.set, true]);
      }
    }
    setContent(raw);
  });
});

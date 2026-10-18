import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ItemForm from '../admin/ItemForm';
import { renderApp } from '../test-utils';
import bundled from '../lib/bundledContent';
import { setContent } from '../lib/content';
import { validateItem } from '../lib/contentSchema';
import { blankItem, tidyItem } from '../admin/adminDraft';
import { buildSoundRound, lessonProgress, lessonQuestions, lessonWord, markedIndexes, soundKinds, soundName } from '../games/sounds/soundsLogic';

// A quoted answer that ends a sentence gets no extra full stop.
const answerWas = (a) => `Not this time. The answer was "${a}"${/[.?!]$/.test(a) ? '' : '.'}`;

// Lessons of their own, so the tests don't depend on what the word base holds.
const silentK = {
  id: 'test-silent-k', type: 'sound', kind: 'silent',
  title: { en: 'Test silent k', fi: 'Testi äänetön k' },
  explanation: { en: 'The k in kn is silent.', fi: 'K jätetään sanomatta.' },
  words: [
    { text: '[k]nife', say: { fi: 'naif' }, meaning: { fi: 'veitsi' } },
    { text: '[k]nee', say: { fi: 'nii' }, meaning: { fi: 'polvi' } },
    { text: '[k]nock', say: { fi: 'nok' }, meaning: { fi: 'koputtaa' } },
  ],
};
const cSounds = {
  id: 'test-c', type: 'sound', kind: 'sound',
  title: { en: 'Test c', fi: 'Testi c' },
  explanation: { en: 'c before e, i or y is s.', fi: 'c ennen e, i tai y on s.' },
  sounds: [{ id: 's', label: { en: 's', fi: 's' } }, { id: 'k', label: { en: 'k', fi: 'k' } }],
  words: [
    { text: '[c]ity', say: { fi: 'siti' }, meaning: { fi: 'kaupunki' }, sound: 's' },
    { text: '[c]at', say: { fi: 'kät' }, meaning: { fi: 'kissa' }, sound: 'k' },
    { text: 'i[c]e', say: { fi: 'ais' }, meaning: { fi: 'jää' }, sound: 's' },
    { text: '[c]up', say: { fi: 'kap' }, meaning: { fi: 'kuppi' }, sound: 'k' },
  ],
};
const ckK = {
  id: 'test-ck', type: 'sound', kind: 'spell',
  title: { en: 'Test ck or k', fi: 'Testi ck vai k' },
  explanation: { en: 'ck after a short vowel.', fi: 'ck lyhyen vokaalin jälkeen.' },
  spellings: ['ck', 'k'],
  words: [
    { text: 'ba[ck]', say: { fi: 'bäk' }, meaning: { fi: 'selkä' } },
    { text: 'du[ck]', say: { fi: 'dak' }, meaning: { fi: 'ankka' } },
    { text: 'mil[k]', say: { fi: 'milk' }, meaning: { fi: 'maito' } },
    { text: 'boo[k]', say: { fi: 'buk' }, meaning: { fi: 'kirja' } },
  ],
};
const letters = {
  id: 'test-letters', type: 'sound', kind: 'letters',
  title: { en: 'Test letters', fi: 'Testikirjaimet' },
  explanation: { en: 'A is ei.', fi: 'A on ei.' },
  words: [{ text: 'A', say: { fi: 'ei' } }, { text: 'E', say: { fi: 'ii' } }, { text: 'I', say: { fi: 'ai' } }, { text: 'O', say: { fi: 'ou' } }],
};
const shipSheep = {
  id: 'test-pairs', type: 'sound', kind: 'pairs',
  title: { en: 'Test ship or sheep', fi: 'Testi ship vai sheep' },
  explanation: { en: 'Short i and long ee.', fi: 'Lyhyt i ja pitkä ii.' },
  words: [
    { text: 'ship', say: { fi: 'šip' }, meaning: { fi: 'laiva' }, pair: 'sheep' },
    { text: 'sheep', say: { fi: 'šiip' }, meaning: { fi: 'lammas' }, pair: 'ship' },
    { text: 'sit', meaning: { fi: 'istua' }, pair: 'seat' },
    { text: 'seat', meaning: { fi: 'istuin' }, pair: 'sit' },
  ],
};
const pack = { id: 'test-sounds', title: { en: 'Test sounds' }, items: [silentK, cSounds, ckK, letters, shipSheep] };

beforeAll(() => {
  setContent({ ...bundled, index: { ...bundled.index, packs: [...bundled.index.packs, pack.id] }, packs: [...bundled.packs, pack] });
});
afterAll(() => setContent(bundled));
afterEach(() => {
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
});

function fakeSpeech() {
  const spoken = [];
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  window.speechSynthesis = { speak: (u) => spoken.push(u), cancel: () => {}, getVoices: () => [] };
  return spoken;
}

describe('sound items in the word bank', () => {
  it('accepts every kind of lesson', () => {
    expect(validateItem(silentK)).toEqual([]);
    expect(validateItem(cSounds)).toEqual([]);
    expect(validateItem(ckK)).toEqual([]);
    expect(validateItem(letters)).toEqual([]);
    expect(validateItem(shipSheep)).toEqual([]);
  });

  it('needs each sound-alike word to point at another word in the lesson', () => {
    const broken = { ...shipSheep, words: [...shipSheep.words.slice(1), { text: 'ship', pair: 'shop' }] };
    expect(validateItem(broken).join(' ')).toMatch(/pair must be another word in this lesson/);
  });

  it('explains missing brackets, unknown sounds and letter names with brackets', () => {
    const noMark = { ...silentK, words: [...silentK.words.slice(1), { text: 'knot' }] };
    expect(validateItem(noMark).join(' ')).toMatch(/put \[ \] around the silent letters/);
    const badSound = { ...cSounds, words: [...cSounds.words.slice(1), { text: '[c]up', sound: 'x' }] };
    expect(validateItem(badSound).join(' ')).toMatch(/sound must be one of the ids/);
    const marked = { ...letters, words: [...letters.words.slice(1), { text: '[A]' }] };
    expect(validateItem(marked).join(' ')).toMatch(/letter names don't use/);
    expect(validateItem({ ...silentK, kind: 'other' }).join(' ')).toMatch(/kind must be one of/);
  });

  it('wants spelling lessons to mark one of their spellings', () => {
    expect(validateItem({ ...ckK, spellings: ['ck'] }).join(' ')).toMatch(/spellings needs at least two/);
    expect(validateItem({ ...ckK, spellings: ['ck', 'CK'] }).join(' ')).toMatch(/"CK" is listed twice/);
    const wrong = { ...ckK, words: [...ckK.words.slice(1), { text: 'ri[ch]' }] };
    expect(validateItem(wrong).join(' ')).toMatch(/must be one of the spellings/);
    const unmarked = { ...ckK, words: [...ckK.words.slice(1), { text: 'back' }] };
    expect(validateItem(unmarked).join(' ')).toMatch(/letters the learner picks/);
  });
});

describe('admin editing of lessons', () => {
  it('starts a new lesson that the checks explain, and tidies empty fields away', () => {
    const fresh = blankItem('sound', new Set());
    expect(validateItem(tidyItem(fresh)).join(' ')).toMatch(/words needs at least three words/);
    const tidy = tidyItem({ ...silentK, sounds: cSounds.sounds, words: [{ text: '[k]nit', say: { fi: '' }, meaning: { fi: 'neuloa' }, speak: ' ', sound: 's' }] });
    expect(tidy.sounds).toBeUndefined();
    expect(tidy.words[0]).toEqual({ text: '[k]nit', meaning: { fi: 'neuloa' } });
  });

  it('has a form with the sounds to choose from for tricky letters', () => {
    const changes = [];
    render(<ItemForm item={cSounds} onChange={(i) => changes.push(i)} languages={[]} topics={[]} categories={[]} />);
    expect(screen.getByRole('group', { name: 'Sounds to choose from' })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('[c]ity')).toHaveLength(1);
    fireEvent.change(screen.getByRole('combobox', { name: /Kind/ }), { target: { value: 'silent' } });
    expect(changes.at(-1).kind).toBe('silent');
    expect(changes.at(-1).sounds).toBeUndefined();
  });

  it('has a spellings field for spelling lessons', () => {
    const changes = [];
    render(<ItemForm item={ckK} onChange={(i) => changes.push(i)} languages={[]} topics={[]} categories={[]} />);
    const field = screen.getByRole('textbox', { name: /Spellings to choose from/ });
    expect(field).toHaveValue('ck, k');
    fireEvent.change(field, { target: { value: 'ck, k, c' } });
    expect(changes.at(-1).spellings).toEqual(['ck', 'k', 'c']);
  });
});

describe('soundsLogic', () => {
  it('finds the marked letters in the plain word', () => {
    const w = lessonWord(silentK, { text: 'ni[gh]t' });
    expect(w.text).toBe('night');
    expect(markedIndexes(w)).toEqual([2, 3]);
  });

  it('asks letter names with four letters from the same lesson', () => {
    const q = lessonQuestions(letters)[0];
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.id)).toContain(q.answer);
  });

  it('never shows the asked word as the example of a sound', () => {
    for (let i = 0; i < 20; i++) {
      for (const q of lessonQuestions(cSounds)) {
        const labels = q.options.map((o) => o.label.en);
        expect(labels.some((l) => l.endsWith(` ${q.word.text}`))).toBe(false);
        expect(labels.every((l) => /^[sk], as in (city|cat|ice|cup)$/.test(l))).toBe(true);
        expect(q.options.map((o) => o.label.fi)).toContain(`${q.answer}, kuten sanassa ${q.options.find((o) => o.id === q.answer).example}`);
      }
    }
  });

  it('cuts the example out of labels written the old way', () => {
    expect(soundName({ en: 'd, as in played', fi: 'd, kuten sanassa played' })).toEqual({ en: 'd', fi: 'd' });
    expect(soundName({ en: 'Quiet th', fi: 'Soinniton th' })).toEqual({ en: 'Quiet th', fi: 'Soinniton th' });
    const old = { ...cSounds, sounds: [{ id: 's', label: { en: 's, as in city' } }, { id: 'k', label: { en: 'k, as in cat' } }] };
    const q = lessonQuestions(old).find((x) => x.word.text === 'city');
    expect(q.options[0].label.en).toBe('s, as in ice');
  });

  it('wants two words for every sound', () => {
    const one = { ...cSounds, words: cSounds.words.filter((w) => w.text !== '[c]up') };
    expect(validateItem(one).join(' ')).toMatch(/sound "k" needs at least two words/);
  });

  it('asks a spelling with every spelling of the lesson as an option', () => {
    const q = lessonQuestions(ckK).find((x) => x.word.text === 'back');
    expect(q.options.map((o) => o.id)).toEqual(['ck', 'k']);
    expect(q.answer).toBe('ck');
    expect(q.word.parts).toEqual({ before: 'ba', marked: 'ck', after: '', plain: 'back' });
  });

  it('asks a sound-alike word against its own pair', () => {
    const q = lessonQuestions(shipSheep).find((x) => x.answer === 'sit');
    expect(q.options.map((o) => o.id).sort()).toEqual(['seat', 'sit']);
  });

  it('mixes lessons and leaves letter names out without sound', () => {
    const lessons = [silentK, cSounds, letters];
    const round = buildSoundRound(lessons, { count: 3 });
    expect(new Set(round.map((q) => q.lessonId)).size).toBe(3);
    expect(buildSoundRound([...lessons, shipSheep], { withSound: false }).some((q) => q.kind === 'letters' || q.kind === 'pairs')).toBe(false);
    expect(buildSoundRound(lessons, { setId: 'test-c' }).every((q) => q.lessonId === 'test-c')).toBe(true);
  });

  it('limits a mix to the picked kinds, and offers only kinds that can be played', () => {
    const lessons = [silentK, cSounds, ckK, letters];
    expect(soundKinds(lessons)).toEqual(['silent', 'sound', 'spell', 'letters']);
    expect(soundKinds(lessons, { withSound: false })).toEqual(['silent', 'sound', 'spell']);
    const round = buildSoundRound(lessons, { kinds: ['spell', 'silent'] });
    expect(new Set(round.map((q) => q.kind))).toEqual(new Set(['spell', 'silent']));
    expect(buildSoundRound(lessons, { kinds: ['pairs'] }).length).toBeGreaterThan(4);
  });

  it('counts lesson words solved in any game', () => {
    const state = { words: { 'en:knife': { solved: 1 }, 'en:knee': { solved: 0, lost: 1 } } };
    expect(lessonProgress(silentK, state)).toEqual({ solved: 1, total: 3 });
  });
});

describe('Sounds of English', () => {
  it('has a card on the home screen and lists lessons by kind', () => {
    renderApp('/');
    fireEvent.click(screen.getByRole('link', { name: /Sounds of English/ }));
    expect(screen.getByRole('heading', { name: 'Silent letters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tricky letters' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Test silent k/ })).toHaveTextContent('0 of 3 words practiced');
  });

  it('shows the rule in English and Finnish and reads a word aloud', () => {
    const spoken = fakeSpeech();
    renderApp('/sounds?set=test-silent-k');
    expect(screen.getByText('The k in kn is silent.')).toBeInTheDocument();
    expect(screen.getByText('K jätetään sanomatta.')).toHaveAttribute('lang', 'fi');
    fireEvent.click(screen.getByRole('button', { name: 'knife' }));
    expect(spoken[spoken.length - 1].text).toBe('knife');
    fireEvent.click(screen.getByRole('button', { name: 'knife, slowly' }));
    expect(spoken[spoken.length - 1].rate).toBeLessThan(0.9);
  });

  it('practises silent letters: tap the letter you do not hear', () => {
    const spoken = fakeSpeech();
    const { storage } = renderApp('/sounds?set=test-silent-k&practise=1');
    const word = spoken[spoken.length - 1].text;
    const tiles = within(screen.getByRole('group', { name: 'Letters in the word' })).getAllByRole('button');
    expect(tiles.map((b) => b.textContent).join('')).toBe(word);
    fireEvent.click(tiles[1]);
    expect(screen.getByText('Not quite. Try another one.')).toBeInTheDocument();
    fireEvent.click(tiles[0]);
    expect(screen.getByText(`Yes, "${word}" is right.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'k, silent' })).toBeInTheDocument();
    const lessonWordFor = silentK.words.map((w) => lessonWord(silentK, w)).find((w) => w.text === word);
    expect(screen.getByText(lessonWordFor.say)).toHaveAttribute('lang', 'fi');
    expect(screen.getByText(lessonWordFor.fi)).toHaveAttribute('lang', 'fi');
    expect(JSON.stringify(storage.data)).toContain(`en:${word}`);
  });

  it('practises tricky letters: pick the sound, with Finnish under each option', () => {
    fakeSpeech();
    renderApp('/sounds?set=test-c&practise=1');
    const group = screen.getByRole('group', { name: 'Sounds to choose from' });
    expect(within(group).getByText(/^s, kuten sanassa (city|ice)$/)).toHaveAttribute('lang', 'fi');
    const word = screen.getByText((_, el) => el?.classList?.contains('snd-word-big')).textContent;
    const answer = cSounds.words.find((w) => w.text.replace(/[[\]]/g, '') === word).sound;
    fireEvent.click(within(group).getByRole('button', { name: new RegExp(`^${answer}, as in`) }));
    expect(screen.getByText(`Yes, "${word}" is right.`)).toBeInTheDocument();
  });

  it('practises spelling: hear the word and pick the missing letters', () => {
    const spoken = fakeSpeech();
    renderApp('/sounds?set=test-ck&practise=1');
    const heard = spoken[spoken.length - 1].text;
    const lesson = ckK.words.map((w) => lessonWord(ckK, w)).find((w) => w.text === heard);
    expect(screen.queryByText(heard)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'missing letters' })).toBeInTheDocument();
    expect(screen.getByText(lesson.fi)).toHaveAttribute('lang', 'fi');
    expect(screen.getByText('Which letters are missing?')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Spellings to choose from' });
    const wrong = lesson.parts.marked === 'ck' ? 'k' : 'ck';
    fireEvent.click(within(group).getByRole('button', { name: wrong }));
    expect(screen.getByText(answerWas(heard))).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.classList?.contains('snd-word-big'))).toHaveTextContent(heard);
    expect(screen.queryByRole('img', { name: 'missing letters' })).not.toBeInTheDocument();
  });

  it('practises letter names by ear and shows how each is said', () => {
    const spoken = fakeSpeech();
    renderApp('/sounds?set=test-letters&practise=1');
    const heard = spoken[spoken.length - 1].text;
    const group = screen.getByRole('group', { name: 'Letters to choose from' });
    fireEvent.click(within(group).getByRole('button', { name: heard }));
    expect(screen.getByText(`Yes, "${heard}" is right.`)).toBeInTheDocument();
    const say = letters.words.find((w) => w.text === heard).say.fi;
    expect(within(group).getByText(say)).toBeInTheDocument();
  });

  it('practises sound-alike words by ear and shows both meanings', () => {
    const spoken = fakeSpeech();
    renderApp('/sounds?set=test-pairs&practise=1');
    const heard = spoken[spoken.length - 1].text;
    const group = screen.getByRole('group', { name: 'Words to choose from' });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(within(group).getByRole('button', { name: heard }));
    expect(screen.getByText(`Yes, "${heard}" is right.`)).toBeInTheDocument();
    const other = shipSheep.words.find((w) => w.text === heard).pair;
    const otherFi = shipSheep.words.find((w) => w.text === other).meaning.fi;
    expect(within(group).getByText(new RegExp(otherFi))).toHaveAttribute('lang', 'fi');
  });

  it('works without sound, leaving letter names out', () => {
    renderApp('/sounds?set=mix');
    expect(screen.queryByRole('group', { name: 'Letters to choose from' })).not.toBeInTheDocument();
    renderApp('/sounds');
    expect(screen.getAllByText(/can't play sound/).length).toBeGreaterThan(0);
  });

  it('lets a mix be limited to kinds of lesson and remembers them', () => {
    localStorage.clear();
    fakeSpeech();
    const { unmount } = renderApp('/sounds?set=mix');
    fireEvent.click(screen.getByRole('button', { name: /Topics: All topics/ }));
    const panel = screen.getByRole('group', { name: 'Topics' });
    expect(within(panel).getAllByRole('button').map((b) => b.textContent.replace(/^[+✓]/, ''))).toEqual([
      'All topics', 'Silent letters', 'Tricky letters', 'Spelling', 'Sound-alike words', 'Letter names', 'Play these',
    ]);
    fireEvent.click(within(panel).getByRole('button', { name: /Spelling/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Play these' }));
    expect(screen.getByRole('button', { name: /Topics: Spelling/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Spellings to choose from' })).toBeInTheDocument();
    unmount();

    renderApp('/sounds?set=mix', { lang: 'fi' });
    expect(screen.getByRole('button', { name: /Aiheet: Oikeinkirjoitus/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('lingo.gapTopics.v1')).sounds).toEqual(['spell']);
  });

  it('has no topic picker when practising one lesson', () => {
    fakeSpeech();
    renderApp('/sounds?set=test-ck&practise=1');
    expect(screen.queryByRole('button', { name: /Topics:/ })).not.toBeInTheDocument();
  });

  it('uses Finnish titles and rules in the Finnish interface', () => {
    renderApp('/sounds?set=test-silent-k', { lang: 'fi' });
    expect(screen.getByRole('heading', { name: 'Testi äänetön k' })).toBeInTheDocument();
    expect(screen.queryByText('The k in kn is silent.')).not.toBeInTheDocument();
  });
});

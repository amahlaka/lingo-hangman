import { CHOICES, decoyPoolFor, gapItemChoices, pickChoices } from '../lib/decoys';
import { gapQuestions } from '../games/gap/gapLogic';
import { gapItemQuestion } from '../games/practice/practiceLogic';
import { validateItem } from '../lib/contentSchema';

const topic = { id: 'he-she', type: 'rule', decoyPool: ['he', 'she', 'it', 'they', 'we', 'I'] };
const item = {
  id: 'nurse', type: 'gap', lang: 'en', topic: 'he-she',
  sentence: 'My sister is a nurse. ___ works at night.',
  answers: ['She'], distractors: ['He'], translation: { fi: 'Siskoni on sairaanhoitaja.' },
};

describe('decoys', () => {
  it('shows the entry decoys first and fills the rest from the pool', () => {
    for (let i = 0; i < 30; i++) {
      const { answer, options } = gapItemChoices(item, topic);
      expect(answer).toBe('She');
      expect(options).toHaveLength(CHOICES);
      expect(options.slice(0, 2)).toEqual(['She', 'He']);
      expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(CHOICES);
      // Pool words take the answer's capital at the start of the sentence.
      for (const o of options.slice(2)) expect(['It', 'They', 'We', 'I']).toContain(o);
    }
  });

  it('draws different pool words from round to round', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) gapItemChoices(item, topic).options.slice(2).forEach((o) => seen.add(o));
    expect(seen.size).toBeGreaterThan(2);
  });

  it('never offers an accepted answer or a word the sentence already has', () => {
    const { options } = pickChoices({
      answers: ['me', 'him'], decoys: ['I'], pool: ['me', 'him', 'my', 'the', 'pen', 'she'],
      sentence: 'Can you give ___ the pen?',
    });
    expect(options.slice(0, 2)).toEqual(['me', 'I']);
    expect(options.slice(2).sort()).toEqual(['my', 'she']);
  });

  it('lets an item replace or turn off its topic pool', () => {
    expect(decoyPoolFor({ ...item, decoyPool: ['you'] }, topic)).toEqual(['you']);
    expect(gapItemChoices({ ...item, decoyPool: [] }, topic).options).toEqual(['She', 'He']);
    expect(gapItemChoices(item, { ...topic, decoyPool: undefined }).options).toEqual(['She', 'He']);
  });

  it('is used by the grammar games and Fill the Gap', () => {
    const [q] = gapQuestions({ topics: [{ ...topic, title: { en: 'He or she' }, explanation: { en: 'x' } }], gaps: [item] });
    expect(q.options).toHaveLength(CHOICES);
    const fill = gapItemQuestion({ ...item, topic: undefined, decoyPool: ['They', 'We'] }, 'fi');
    expect(fill.options.slice().sort()).toEqual(['He', 'She', 'They', 'We']);
  });

  it('checks the pool is a list of words', () => {
    expect(validateItem({ ...item, decoyPool: ['it', ''] }).join(' ')).toMatch(/decoyPool must be a list/);
    expect(validateItem({ ...item, decoyPool: ['it', 'It'] }).join(' ')).toMatch(/listed twice/);
    expect(validateItem({ ...item, decoyPool: ['it'] })).toEqual([]);
  });
});

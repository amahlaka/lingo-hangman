import { spokenTextOf } from '../admin/AdminReports';

describe('the spoken text of a report', () => {
  it('is the sound lesson word, else the answer', () => {
    expect(spokenTextOf({ question: { word: { text: 'jacket', speak: 'jacket' } }, answer: 'dzh' })).toBe('jacket');
    expect(spokenTextOf({ question: { word: { text: '[k]nife' } } })).toBe('knife');
    expect(spokenTextOf({ question: { id: 'headset' }, answer: 'headset' })).toBe('headset');
    expect(spokenTextOf({ question: { target: { learning: 'Hi there.' } } })).toBe('Hi there.');
    expect(spokenTextOf(null)).toBe('');
  });
});

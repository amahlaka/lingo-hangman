import { render } from '@testing-library/react';
import ExampleText, { plainText, splitExamples } from '../components/lingo/ExampleText';
import { validateItem } from '../lib/contentSchema';

describe('English examples in explanations', () => {
  const text = 'Kun sana alkaa kirjaimilla *kn*, *k* jätetään sanomatta. Sanotaan vain *n*, joten *know* kuulostaa samalta kuin *no*.';

  it('marks the parts between asterisks as English', () => {
    const { container } = render(<p><ExampleText text={text} /></p>);
    const marks = [...container.querySelectorAll('mark.lg-example')];
    expect(marks.map((m) => m.textContent)).toEqual(['kn', 'k', 'n', 'know', 'no']);
    expect(marks.every((m) => m.getAttribute('lang') === 'en')).toBe(true);
    expect(container.textContent).toBe(plainText(text));
    expect(container.textContent).not.toContain('*');
  });

  it('leaves text with an unpaired asterisk as it is', () => {
    expect(splitExamples('5 * 3')).toEqual([{ text: '5 * 3' }]);
  });

  it('reports an unpaired asterisk in the word base', () => {
    const lesson = { id: 'silent-k', type: 'sound', kind: 'silent', title: { en: 'Silent k' }, explanation: { en: 'The *k is silent.' }, words: [{ text: '[k]nife' }] };
    expect(validateItem(lesson)).toContain('explanation.en has an unpaired *');
    expect(validateItem({ ...lesson, explanation: { en: 'The *k* is silent.' } })).not.toContain('explanation.en has an unpaired *');
  });
});

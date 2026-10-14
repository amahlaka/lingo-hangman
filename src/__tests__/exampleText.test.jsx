import { fireEvent, render, screen } from '@testing-library/react';
import ExampleText, { plainText, splitExamples } from '../components/lingo/ExampleText';
import { splitTerms } from '../components/lingo/Term';
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

describe('Vowels and consonants in explanations', () => {
  it('finds the English and Finnish words, compounds included', () => {
    const terms = (text) => splitTerms(text).filter((p) => p.kind).map(({ text: t, kind, lang }) => `${t}:${kind}:${lang}`);
    expect(terms('Use an before a vowel sound and a before a consonant sound. Vowels, consonants.')).toEqual([
      'vowel:vowel:en', 'consonant:consonant:en', 'Vowels:vowel:en', 'consonants:consonant:en',
    ]);
    expect(terms('An tulee vokaaliäänteen eteen ja a konsonanttiäänteen eteen. Kuulet vain vokaalin.')).toEqual([
      'vokaaliäänteen:vowel:fi', 'konsonanttiäänteen:consonant:fi', 'vokaalin:vowel:fi',
    ]);
    expect(terms('The bowels of a vowelish word')).toEqual([]);
    expect(splitTerms('a vowel here').map((p) => p.text).join('')).toBe('a vowel here');
  });

  it('underlines them and shows the letters on tap, in the language of the word', () => {
    const { container } = render(<p><ExampleText text="Kuulet vain *gh*:ta edeltävän vokaalin." /></p>);
    expect(container.textContent).toBe('Kuulet vain gh:ta edeltävän vokaalin.');
    const term = screen.getByRole('button', { name: 'vokaalin' });
    expect(term).toHaveClass('lg-term');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(term);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveAttribute('lang', 'fi');
    expect(tip).toHaveTextContent('Englannin vokaalit');
    expect(tip).toHaveTextContent('a, e, i, o, u');
    expect(term).toHaveAttribute('aria-describedby', tip.id);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip while a mouse hovers, and keeps it once clicked', () => {
    render(<p><ExampleText text="Use a before a consonant sound." /></p>);
    const term = screen.getByRole('button', { name: 'consonant' });
    fireEvent.mouseEnter(term);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Consonants');
    expect(screen.getByRole('tooltip')).toHaveTextContent('b, c, d, f, g');
    fireEvent.mouseLeave(term);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(term);
    fireEvent.click(term);
    fireEvent.mouseLeave(term);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

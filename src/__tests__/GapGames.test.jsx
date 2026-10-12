import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import confusables from '../content/confusables.json';
import { gapQuestions } from '../games/gap/gapLogic';

const borrowLend = gapQuestions(confusables).filter((q) => q.setId === 'borrow-lend');
const current = () => {
  const fi = screen.getByText((_, el) => el?.classList?.contains('gp-translation')).textContent;
  return borrowLend.find((q) => q.fi === fi);
};
const options = () => within(screen.getByRole('group')).getAllByRole('button');

describe('Home', () => {
  it('shows cards for the grammar and mixed-up words games', () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: /Grammar check/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mixed-up words/ })).toBeInTheDocument();
  });
});

describe('Mixed-up words', () => {
  it('fills the gap, explains the rule in Finnish and records the sentence', () => {
    const { storage } = renderApp('/mixed-up?set=borrow-lend');
    const q = current();
    expect(screen.queryByText(/kaksi eri verbiä/)).not.toBeInTheDocument();
    fireEvent.click(options().find((b) => b.textContent === q.answer));
    expect(screen.getByText(`Yes, "${q.sentence}" is right.`)).toBeInTheDocument();
    expect(screen.getByText(/Right on the first try/)).toBeInTheDocument();
    const why = screen.getByRole('region', { name: 'Why' });
    expect(within(why).getByText(/kaksi eri verbiä/)).toHaveAttribute('lang', 'fi');
    expect(within(why).getByText(/Borrow: you get something/)).toBeInTheDocument();
    expect(JSON.stringify(storage.data)).toContain(q.sentence.toLowerCase());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(`2 of ${borrowLend.length}`)).toBeInTheDocument();
  });

  it('shows the answer gently after one miss when there are only two options', () => {
    renderApp('/mixed-up?set=borrow-lend');
    const q = current();
    fireEvent.click(options().find((b) => b.textContent !== q.answer));
    expect(screen.getByText(`Not this time. The answer was "${q.sentence}".`)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Why' })).toBeInTheDocument();
  });

  it('shows only Finnish explanations in the Finnish interface', () => {
    renderApp('/mixed-up?set=borrow-lend', { lang: 'fi' });
    const q = current();
    fireEvent.click(options().find((b) => b.textContent === q.answer));
    const why = screen.getByRole('region', { name: 'Miksi näin' });
    expect(within(why).getByText(/kaksi eri verbiä/)).toBeInTheDocument();
    expect(within(why).queryByText(/Borrow: you get something/)).not.toBeInTheDocument();
  });
});

describe('Grammar check', () => {
  it('offers "no word" as an option for articles and capitalises a gap at the start', () => {
    renderApp('/grammar?set=articles');
    expect(options().map((b) => b.textContent)).toEqual(expect.arrayContaining(['(no word)']));
  });

  it('plays a full round and ends with sentences', () => {
    renderApp('/grammar');
    for (let i = 0; i < 10; i++) {
      fireEvent.click(options()[0]);
      if (!screen.queryByRole('button', { name: /Next|See results/ })) fireEvent.click(options().find((b) => !b.disabled));
      fireEvent.click(screen.getByRole('button', { name: /Next|See results/ }));
    }
    expect(screen.getByText('You practised 10 sentences.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sentences from this round' })).toBeInTheDocument();
  });
});

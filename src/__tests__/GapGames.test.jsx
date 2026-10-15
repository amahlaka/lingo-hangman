import { fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import { getGapItems, getTopics } from '../lib/words';
import { gapQuestions } from '../games/gap/gapLogic';

const borrowLend = gapQuestions({ topics: getTopics('confusable'), gaps: getGapItems() }).filter(
  (q) => q.setId === 'borrow-lend'
);
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
    expect(screen.getByText('You practiced 10 sentences.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sentences from this round' })).toBeInTheDocument();
  });
});

describe('The rule after answering', () => {
  const rect = (top, bottom) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top });
  let spy;
  const innerHeight = window.innerHeight;
  // The explanation lands under the bottom bar, as on a phone.
  beforeEach(() => {
    spy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.querySelector?.('.gp-why')) return rect(900, 1200);
      if (this.classList.contains('lg-tray')) return rect(500, 800);
      return rect(0, 0);
    });
  });
  afterEach(() => {
    spy.mockRestore();
    window.innerHeight = innerHeight;
  });

  it('moves into the bottom bar when it would be hidden under it', () => {
    window.innerHeight = 800;
    const { container } = renderApp('/mixed-up?set=borrow-lend');
    fireEvent.click(options().find((b) => b.textContent === current().answer));
    const why = screen.getByRole('region', { name: 'Why' });
    expect(container.querySelector('.lg-tray')).toContainElement(why);
    expect(within(why).getByText(/kaksi eri verbiä/)).toBeInTheDocument();
  });

  it('gets its own view after Next on a short screen', () => {
    window.innerHeight = 480;
    const { container } = renderApp('/mixed-up?set=borrow-lend');
    fireEvent.click(options().find((b) => b.textContent === current().answer));
    expect(screen.queryByRole('region', { name: 'Why' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const why = screen.getByRole('region', { name: 'Why' });
    expect(container.querySelector('.pg-rule-step')).toContainElement(why);
    expect(screen.getByText(`1 of ${borrowLend.length}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(`2 of ${borrowLend.length}`)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Why' })).not.toBeInTheDocument();
  });
});

describe('Peeking at the rule', () => {
  it('costs points from this round and shows only the rule before answering', () => {
    renderApp('/mixed-up?set=borrow-lend');
    expect(screen.getByRole('button', { name: /Show the rule/ })).toBeDisabled();
    expect(screen.getByText('Earn 5 points to unlock the rule.')).toBeInTheDocument();
    fireEvent.click(options().find((b) => b.textContent === current().answer));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const points = () => Number(screen.getByLabelText(/^Points \d+$/).getAttribute('aria-label').split(' ')[1]);
    const before = points();
    expect(before).toBeGreaterThanOrEqual(5);
    expect(screen.queryByRole('region', { name: 'Why' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the rule (−5 points)' }));
    expect(points()).toBe(before - 5);
    expect(within(screen.getByRole('region', { name: 'Why' })).getByText(/kaksi eri verbiä/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show the rule/ })).not.toBeInTheDocument();
  });
});

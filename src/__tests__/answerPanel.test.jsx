import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test-utils';
import bundled from '../lib/bundledContent';
import { setContent } from '../lib/content';
import { getGapItems, getTopics } from '../lib/words';
import { gapQuestions } from '../games/gap/gapLogic';

const silentK = {
  id: 'test-panel-k', type: 'sound', kind: 'silent',
  title: { en: 'Test silent k', fi: 'Testi äänetön k' },
  explanation: { en: 'The k in kn is silent.', fi: 'K jätetään sanomatta.' },
  words: [
    { text: '[k]nife', say: { fi: 'naif' }, meaning: { fi: 'veitsi' } },
    { text: '[k]nee', say: { fi: 'nii' }, meaning: { fi: 'polvi' } },
    { text: '[k]nock', say: { fi: 'nok' }, meaning: { fi: 'koputtaa' } },
  ],
};
const pack = { id: 'test-panel', title: { en: 'Test panel' }, items: [silentK] };

const borrowLend = gapQuestions({ topics: getTopics('confusable'), gaps: getGapItems() }).filter(
  (q) => q.setId === 'borrow-lend'
);
const currentGap = () => {
  const fi = screen.getByText((_, el) => el?.classList?.contains('gp-translation')).textContent;
  return borrowLend.find((q) => q.fi === fi);
};
const answerGap = () =>
  fireEvent.click(within(screen.getByRole('group')).getAllByRole('button').find((b) => b.textContent === currentGap().answer));
const answerSilentK = () =>
  fireEvent.click(within(screen.getByRole('group', { name: 'Letters in the word' })).getAllByRole('button')[0]);

const rect = (top, bottom) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top });
const innerHeight = window.innerHeight;
let spy;

beforeAll(() => {
  setContent({ ...bundled, index: { ...bundled.index, packs: [...bundled.index.packs, pack.id] }, packs: [...bundled.packs, pack] });
});
afterAll(() => setContent(bundled));

// What the answer reveals lands under the bottom bar, as on a phone.
beforeEach(() => {
  spy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('pg-reveal')) return rect(900, 1200);
    if (this.classList.contains('lg-tray')) return rect(500, 800);
    return rect(0, 0);
  });
});
afterEach(() => {
  spy.mockRestore();
  window.innerHeight = innerHeight;
});

describe('How to read the word after answering', () => {
  it('moves into the bottom bar with Next when it would be covered', () => {
    window.innerHeight = 800;
    const { container } = renderApp('/sounds?set=test-panel-k&practise=1');
    answerSilentK();
    const tray = container.querySelector('.lg-tray');
    const reading = screen.getByText('Read the Finnish way:').closest('.snd-say');
    expect(tray).toContainElement(reading);
    expect(tray.querySelector('.pg-tray-lead')).toContainElement(reading);
  });

  it('stays in place when there is room for it', () => {
    spy.mockImplementation(function () {
      if (this.classList.contains('lg-tray')) return rect(700, 800);
      return rect(100, 300);
    });
    window.innerHeight = 800;
    const { container } = renderApp('/sounds?set=test-panel-k&practise=1');
    answerSilentK();
    expect(container.querySelector('.lg-tray')).not.toContainElement(screen.getByText('Read the Finnish way:'));
  });

  it('stays next to Next on a short screen, and Next goes on when there is no rule', () => {
    window.innerHeight = 480;
    const { container } = renderApp('/sounds?set=test-panel-k&practise=1');
    answerSilentK();
    expect(container.querySelector('.lg-tray')).toContainElement(screen.getByText('Read the Finnish way:'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });
});

describe('Scrolling while the bottom bar holds the rule', () => {
  let heights;
  beforeEach(() => {
    // The rule is taller than the preview, so it starts cut off.
    heights = [
      jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
        return this.classList.contains('pg-tray-rule__body') ? 300 : 0;
      }),
      jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
        return this.classList.contains('pg-tray-rule__body') ? 120 : 0;
      }),
    ];
    window.innerHeight = 800;
  });
  afterEach(() => heights.forEach((h) => h.mockRestore()));

  const toggle = () => screen.getByRole('button', { name: /^Show (all|less)$/ });

  it('opens the rule when scrolling down, not up', () => {
    renderApp('/mixed-up?set=borrow-lend');
    answerGap();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.wheel(window, { deltaY: -40 });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.wheel(window, { deltaY: 40 });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(toggle()).toHaveTextContent('Show less');
  });

  it('opens the rule on a swipe up', () => {
    renderApp('/mixed-up?set=borrow-lend');
    answerGap();
    act(() => {
      fireEvent.touchStart(window, { touches: [{ clientY: 400 }] });
      fireEvent.touchMove(window, { touches: [{ clientY: 340 }] });
    });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaves the rule closed after the learner closes it', () => {
    renderApp('/mixed-up?set=borrow-lend');
    answerGap();
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.wheel(window, { deltaY: 40 });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ListenMore from '../games/practice/ListenMore';
import i18n from '../i18n';
import { filterCommonWords, sentenceFor } from '../lib/words';
import * as speech from '../lib/speech';

const p = i18n.en.practice;

describe('ListenMore', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads a sentence word by word', () => {
    const spy = jest.spyOn(speech, 'speakWords').mockReturnValue(true);
    render(<ListenMore text="They live near the lake." lang="en-GB" p={p} />);
    fireEvent.click(screen.getByRole('button', { name: p.listenWordByWord }));
    expect(spy).toHaveBeenCalledWith('They live near the lake.', { lang: 'en-GB' });
  });

  it('says a single word in a sentence', () => {
    const word = filterCommonWords({ learningLang: 'en-GB', nativeLang: 'fi' })
      .map((w) => w.learning)
      .find((w) => !w.includes(' ') && sentenceFor(w));
    const spy = jest.spyOn(speech, 'speak').mockReturnValue(true);
    render(<ListenMore text={word} lang="en-GB" p={p} />);
    fireEvent.click(screen.getByRole('button', { name: p.listenInSentence }));
    expect(spy.mock.calls[0][0].toLowerCase()).toContain(word.toLowerCase());
  });

  it('shows nothing for a word no sentence uses', () => {
    const { container } = render(<ListenMore text="zzzqx" lang="en-GB" p={p} />);
    expect(container).toBeEmptyDOMElement();
  });
});

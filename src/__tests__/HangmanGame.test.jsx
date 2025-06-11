import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HangmanGame from '../components/HangmanGame';

const t = {
  meaning: 'Meaning',
  score: 'Score',
  wrongGuesses: 'Wrong guesses',
  guessed: 'Congratulations!',
  answerWas: 'Answer was',
  correct: 'Correct',
  incorrect: 'Incorrect',
  nextWord: 'Next word',
  allGuessed: 'All words completed!',
  restart: 'Restart',
  noWords: 'No words',
};

const words = [
  { learning: 'cat', native: 'kissa' },
  { learning: 'dog', native: 'koira' },
];

function setup(props = {}) {
  return render(
    <MemoryRouter>
      <HangmanGame
        lang="en"
        t={t}
        restartFlag={0}
        testWords='W3sibGVhcm5pbmciOiJjYXQiLCJuYXRpdmUiOiJraXNzYSJ9XQ%3D%3D'
        setDarkMode={() => {}}
        darkMode={false}
        setLang={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('HangmanGame', () => {
  it('creates a shareable link (URLGenerator)', () => {
    // This would be tested in URLGenerator, not HangmanGame
    // Placeholder: just check the component renders
    setup();
    expect(screen.getByText(/Meaning/i)).toBeInTheDocument();
  });

  it('guesses a correct letter', () => {
    setup({
      // override words for deterministic test
      lang: 'en',
      t,
      restartFlag: 0,
      testWords: "W3sibGVhcm5pbmciOiJjYXQiLCJuYXRpdmUiOiJraXNzYSJ9XQ%3D%3D"
      // simulate only one word
    });
    // Guess 'C'
    fireEvent.click(screen.getByText('C'));
    // Should reveal C in the word display area (assume word display has a test id 'word-display')
    const letterDisplay = screen.getByTestId('letter-0');
    expect(letterDisplay).toHaveTextContent('C');
    const nativeWord = screen.getByTestId('native-word');
    expect(nativeWord).toHaveTextContent('kissa');
  });

  it('guesses an incorrect letter', () => {
    setup();
    fireEvent.click(screen.getByText('Z'));
    const wordDisplay = screen.getByTestId('word-display');
    expect(wordDisplay).toHaveTextContent('Z');
  });

  it('guesses the word and shows congratulations', async () => {
    setup();
    fireEvent.click(screen.getByText('C'));
    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByText('T'));
    await waitFor(() => {
      expect(screen.getByTestId("guessed")).toBeInTheDocument();
    });
  });

  it('runs out of guesses and shows answer', async () => {
    setup();
    // 6 incorrect guesses
    ['Z', 'X', 'Y', 'Q', 'B', 'W'].forEach(l => fireEvent.click(screen.getByText(l)));
    await waitFor(() => {
      expect(screen.getByTestId("guessed")).toHaveTextContent('Answer was: CAT');
    });
  });

  it('shows congratulation popup when all words are guessed', async () => {
    setup();
    fireEvent.click(screen.getByText('C'));
    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByText('T'));
    // Click next word button
    fireEvent.click(screen.getByText('Next word'));
    await waitFor(() => {
      expect(screen.getByText("All words completed!")).toBeInTheDocument();
    });
  });
});

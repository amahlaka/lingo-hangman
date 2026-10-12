# Lingo Hangman

A hangman-style game meant for expanding the player's available vocabulary.
(Developed to help my fiancée learn more English <3)

## Play Online

You can play Lingo Hangman right now at [https://lingo.bololoo.com](https://lingo.bololoo.com).

## Features

- Random word selection from a large, categorized word list
- Letter-by-letter guessing with keyboard and mouse support
- Score tracking and statistics for each session
- Hints bought with points earned in the session (50-50, remove a letter, clear letters)
- Shared progress across games: points, levels, daily goal, daily streak with a weekly rest day, learned words and achievements
- Customizable word list: create your own games and share links
- User-friendly, responsive interface (mobile and desktop)
- Dark mode support
- Language swap mode (occasionally swap question/answer direction)
- Preset word categories for quick game setup
- Supported languages:
    - UI: English, Finnish
    - Game languages:
        - English (UK)
        - English (US)
        - Finnish
        - German (Untested)
        - French (Untested)
        - Spanish (Untested)
        - Italian (Untested)
        - Swedish (Untested)
        - Portuguese (Untested)
        - Dutch (Untested)
        - Polish (Untested)
        - Czech (Untested)
        - Romanian (Untested)
        - Hungarian (Untested)
        - Turkish (Untested)

(Note: the preset wordlist was generated using Copilot, so it may contain some errors or inaccuracies. Feel free to contribute corrections or improvements!)


## How to Play

1. Select your learning and native language.
2. Add words manually or use presets to quickly fill your word list.
3. Generate a game link or start the game directly.
4. Guess the word letter by letter. Use powerups if you get stuck!
5. Track your score and try to complete all words.

## Development setup

1. Clone the repository:
    ```bash
    git clone https://github.com/amahlaka/lingo-hangman.git
    cd lingo-hangman
    ```
2. You can run the server as is or use the provided dockerfile
    - NPM:
        ```bash
        npm install
        npm run dev
        ```
    - Docker:
        ```bash
        docker build -t lingo-hangman .
        docker run -p 5173:5173 lingo-hangman
        ```
3. Access local development server at http://localhost:5173

## Usage

- Open the app in your browser at http://localhost:5173
- Use the URL generator to create custom games or play with default words.
- Share generated game links with friends or students.

## Project structure

- `src/app/` – home screen and the shared settings and progress providers
- `src/games/` – one folder per game plus `registry.js`; see [src/games/README.md](src/games/README.md) for adding a game
- `src/lib/words.js` – word lists, categories and the shareable `/play?words=` link format
- `src/lib/progress.js` – XP, levels, streaks, daily goal and achievements
- `src/components/lingo/` – UI building blocks from the Lingo design system
- `src/styles/` – design tokens (`tokens.css`), Lingo components (`lingo.css`) and app layout (`app.css`)

## Testing

To run tests:
```bash
npm test
```

## Preview deployments

Any branch, commit or pull request can be published to its own address such as `https://1a2b3c4d.preview.bololoo.com`: run the *Preview deploy* workflow from the Actions tab, or add the `preview` label to a PR. See [docs/preview-deployments.md](docs/preview-deployments.md) for usage, production deploys and the server requirements.

## Contributing

Contributions are welcome! Please open issues or submit pull requests. Suggestions for new features, languages, or word lists are especially appreciated.

## License

This project is licensed under the [Creative Commons NonCommercial 4.0 International License (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/).

You are free to fork, share, and adapt the code for non-commercial purposes. Commercial use is not permitted without explicit permission from the author.
# Lingo Hangman

A hangman-style game meant for expanding the player's available vocabulary.
(Developed to help my fiancée learn more English <3)

## Play Online

You can play Lingo Hangman right now at [https://bololoo.com](https://bololoo.com).

## Features

- Random word selection from a large, categorized word list
- Letter-by-letter guessing with keyboard and mouse support
- Score tracking and statistics for each session
- Powerups to help with guessing (remove incorrect letter, 50-50, nuke)
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

## Testing

To run tests:
```bash
npm test
```

## Contributing

Contributions are welcome! Please open issues or submit pull requests. Suggestions for new features, languages, or word lists are especially appreciated.

## License

This project is licensed under the [Creative Commons NonCommercial 4.0 International License (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/).

You are free to fork, share, and adapt the code for non-commercial purposes. Commercial use is not permitted without explicit permission from the author.
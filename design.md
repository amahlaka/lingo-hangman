Here is a Game Design Document (GDD) for your browser-based Hangman game geared toward language learning, with shareable configuration via URL.

⸻

🎮 Game Design Document (GDD)

Title: LingoHangman
Genre: Educational / Word / Puzzle
Platform: Web browser
Target Audience: Language learners and language instructors

⸻

1. Core Concept

A language learning version of Hangman where:
	•	The host inputs words in a Learning Language along with their Native Language translations.
	•	Players guess the word (in the Learning Language) based on the meaning shown (in the Native Language).
	•	The entire game configuration is embedded in a shareable URL, allowing anyone to play the game asynchronously.

⸻

2. Gameplay Flow

Host Mode:
	•	UI to input multiple word pairs:
	•	Format: LearningWord | NativeTranslation
	•	Example: chat | cat
	•	Button to Generate Link:
	•	Encodes word list and configuration in the URL (e.g., via base64 or compressed JSON).
	•	Link can be copied and shared.

Player Mode:
	•	Player opens the link.
	•	Game selects a random word pair.
	•	Displayed elements:
	•	Top: Native Language word (e.g., “cat”)
	•	Hangman drawing area (updated on wrong guesses)
	•	Word to guess (underscores for each letter of Learning Language word)
	•	Wrong guesses (displayed clearly below)
	•	Alphabet letter buttons or keyboard input
	•	Player keeps guessing letters until:
	•	They guess the word correctly (win)
	•	They run out of allowed guesses (lose)
	•	After a round, a Next Word button appears to move to a new random word (if more exist).

⸻

3. Game Rules
	•	Each word must be guessed one letter at a time.
	•	Player has a max of 6–8 incorrect guesses.
	•	Correct guesses reveal all instances of that letter.
	•	Incorrect guesses are displayed and update the hangman drawing.
	•	Words are pulled randomly and not repeated until all have been played.

⸻

4. UI Layout

+----------------------------------------+
|         Native Language Word           |  <-- e.g. "cat"
+----------------------------------------+
|           Hangman Drawing              |
|        (Gallows + Stick Figure)        |
+----------------------------------------+
|      _ _ _ _     (Word to Guess)       |  <-- e.g. "_ H A T"
+----------------------------------------+
|    Wrong Guesses: E, R, S, L           |
+----------------------------------------+
|   [ A ] [ B ] [ C ] ... [ Z ]          |  <-- Clickable or keyboard input
+----------------------------------------+


⸻

5. URL Configuration
	•	Game configuration (word list) is encoded directly in the URL:
	•	Example:

https://lingohangman.com/play#<encoded-config>


	•	Encoded config format:

[
  {"learning": "chat", "native": "cat"},
  {"learning": "chien", "native": "dog"}
]


	•	Compressed and base64-encoded before being placed in the URL hash or query string.

⸻

6. Tech Stack
	•	Frontend: HTML, CSS, JavaScript
	•	Framework: React (optional), Vanilla JS also viable
	•	Storage: All game state is client-side only
	•	Encoding: Base64 or LZ-string compression for URL-safe payloads

⸻

7. Optional Features (Stretch Goals)
	•	Theme Customization: Light/Dark mode, color schemes
	•	Progress Tracker: How many words guessed correctly
	•	Multilingual Support: UI can be translated
	•	Word Reveal Option: For learners who get stuck
	•	Timed Mode: For extra challenge
	•	Mobile Friendly: Responsive design for phones/tablets

⸻

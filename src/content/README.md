# Game content

Data-only files for games, kept apart from game code so the word database can
take them over (or load them from somewhere else) without touching the games.

| File | Game | Route |
| --- | --- | --- |
| `grammar.json` | Grammar check | `/grammar` |
| `confusables.json` | Mixed-up words | `/mixed-up` |

Both use the item shapes of the word database (topics plus "gap" sentences
that point at a topic), so they can move into a content pack as they are. The
content targets mistakes Finnish speakers often make:
English has articles and he/she where Finnish has none, one Finnish word
covers two English ones (lainata = borrow/lend, pitkä = long/tall), and some
words look like Finnish ones but mean something else (sympathetic, actual).

```jsonc
{
  "version": 2,
  "learningLang": "en-GB",
  "nativeLang": "fi",
  "items": [
    {
      "id": "borrow-lend",                     // stable; used in ?set= links (/mixed-up?set=borrow-lend)
      "type": "confusable",                    // "rule" in grammar.json
      "title": { "en": "borrow or lend", "fi": "lainata: borrow vai lend" },
      "explanation": { "en": "...", "fi": "..." },  // shown after every answer on this topic
      "words": [{ "text": "borrow" }, { "text": "lend" }],  // confusables only
      "level": 1
    },
    {
      "id": "borrow-lend-1",
      "type": "gap",
      "lang": "en",
      "sentence": "Can I ___ your umbrella?",  // exactly one ___ gap
      "answers": ["borrow"],                    // the right word; "" means "no word"
      "distractors": ["lend"],                  // the other choices
      "translation": { "fi": "Voinko lainata sateenvarjoasi?" },
      "explanation": { "en": "...", "fi": "..." },  // optional note for this sentence, shown before the topic's
      "topic": "borrow-lend",
      "categories": [],
      "level": 1
    }
  ]
}
```

Writing tips: one clearly right answer per sentence (read it with each choice
and check none of the others also works), everyday adult situations, short
sentences, and plain Finnish in explanations. A gap at the start of a sentence
gets a capital letter automatically when it is filled, but write the choices in
the case they appear in, as in `["She"]` and `["He"]`.

`src/__tests__/gapContent.test.js` checks every file against these rules.

# Game content

Data-only files for games, kept apart from game code so the word database can
take them over (or load them from somewhere else) without touching the games.

| File | Game | Route |
| --- | --- | --- |
| `grammar.json` | Grammar check | `/grammar` |
| `confusables.json` | Mixed-up words | `/mixed-up` |

Both use the same `gap-choice` format: sentences with one gap and a few words
to choose from. The content targets mistakes Finnish speakers often make:
English has articles and he/she where Finnish has none, one Finnish word
covers two English ones (lainata = borrow/lend, pitkä = long/tall), and some
words look like Finnish ones but mean something else (sympathetic, actual).

```jsonc
{
  "version": 1,
  "kind": "gap-choice",
  "learningLang": "en-GB",          // language of the sentences
  "nativeLang": "fi",               // language of translations and explanations
  "sets": [
    {
      "id": "borrow-lend",          // stable; used in ?set= links (/mixed-up?set=borrow-lend)
      "title": "borrow or lend",    // shown above each sentence
      "titleFi": "lainata: borrow vai lend",
      "options": ["borrow", "lend"],// choices for every item; "" means "no word"
      "rule": { "en": "...", "fi": "..." },  // shown after every answer in the set
      "items": [
        {
          "text": "Can I ___ your umbrella?",   // exactly one ___ gap
          "answer": "borrow",                    // must be one of the options
          "fi": "Voinko lainata sateenvarjoasi?",// Finnish translation of the sentence
          "options": ["borrowed", "lent"],       // optional: replaces the set's options
          "why": { "en": "...", "fi": "..." }    // optional: note for this sentence, shown before the rule
        }
      ]
    }
  ]
}
```

Writing tips: one clearly right answer per sentence (read it with each option
and check none of the others also works), everyday adult situations, short
sentences, and plain Finnish in explanations. A gap at the start of a sentence
gets a capital letter automatically when it is filled, but write options in the
case they appear in, as in `["He", "She"]`.

`src/__tests__/gapContent.test.js` checks every file against these rules.

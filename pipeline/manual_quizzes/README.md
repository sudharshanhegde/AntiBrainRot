# Manual quiz overrides (SKILL_quiz.md)

Hand-written quiz cards live in this directory and are used as-is during
generation, skipping the DeepSeek call for that card entirely.

## Path per card

```
manual_quizzes/<topic>/<deck_index>/<card_order_index>.json
```

For example, a hand-written quiz for card 5 (an odd index, so a quiz slot)
of deck 2 for operating-systems:

```
manual_quizzes/operating-systems/2/5.json
```

## Schema

The file uses the same quiz card schema as the pipeline:

```json
{
  "type": "quiz",
  "order_index": 5,
  "tests_card_id": 4,
  "question": "string, one sentence, directly about the preceding card",
  "options": [
    { "id": "a", "text": "string" },
    { "id": "b", "text": "string" },
    { "id": "c", "text": "string" },
    { "id": "d", "text": "string" }
  ],
  "correct_option_id": "one of a/b/c/d"
}
```

## Rules

- `order_index` and `tests_card_id` are pinned to the slot by the loader
  (`order_index` from the filename, `tests_card_id = order_index - 1`), so
  a hand-typed file cannot drift off its position.
- Exactly four options, exactly one correct, and the correct answer must be
  derivable from the concept card immediately before this slot.
- A manual quiz is still validated by the same automated checks and the LLM
  validation pass, exactly like a generated quiz.
- Concept cards are never manual; only quiz slots can be overridden.

# Contributing

Bring evidence, not theatre.

## Before opening code

- Search existing issues.
- For a small bug, open a pull request directly.
- For a new recommendation rule, font-family expansion, schema change or visual-system rewrite, open an issue first. Those changes alter the product’s judgment, not just its syntax.
- Never add runtime AI, analytics, accounts, email capture, a database or an upload server without an explicit public design decision.

## Local loop

```sh
npm ci
npm run check
```

Keep pull requests narrow enough to review. Explain the user problem, the decision, the trade-off and how you checked it. Screenshots help for visual changes; keyboard and reduced-motion notes help more than “looks good on my machine.”

## Type contributions

New fonts must have:

- a verified OFL-1.1 upstream source;
- exact local WOFF2 files and adjacent license text;
- designer and provenance records;
- role and script evidence;
- no claim of presentation-app compatibility without presentation-app testing.

Use `npm run type-library:sync` only when intentionally changing the curated set, inspect the lock diff, then run the full check.

## Color contributions

Color changes need ugly real-world fixtures, not only handsome moodboards. Preserve deterministic output, contrast truth, source provenance, user locks and reversible corrections.

## Accessibility

Do not trade away keyboard access, visible focus, readable motion settings, contrast status or plain-language labels for spectacle. Delight has to survive contact with a person.

## License

No contributor license agreement. By submitting a contribution, you agree to license it under the same terms that cover the part of the project you changed.

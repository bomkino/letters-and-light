# Type library

This is the production-preview font authority for Letters & Light. It does not replace the preserved Type Set candidate archive in `../legacy/type-set/`.

## Files

- `curation.v1.json` — the human edit: shelves, families, roles, character, density, artifacts, tones and pairing laws.
- `font-library.lock.json` — generated acquisition lock: exact files, hashes, licences, designers, upstream sources and preview/application truth.
- `../../public/fonts/type-library/` — exact WOFF2 resources, one OFL file per family, generated CSS and visible credits.

## Commands

```bash
npm run type-library:validate
npm run type-library:sync
```

Validation is offline and belongs in every check. Sync reaches Google Fonts and deliberately replaces the generated library; use it only when changing the curated set or refreshing upstream files, then review the lock diff and run the full verifier.

## Truth boundary

An exact self-hosted WOFF2 proves the browser is showing the named letterforms. It does not prove PowerPoint, Keynote, Google Slides, PDF export, language quality or recipient-machine behavior. Those remain separate application and human-review gates.

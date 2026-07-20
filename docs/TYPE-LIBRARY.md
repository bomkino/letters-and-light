# Exact type library

The type studio displays fonts because it possesses the fonts—not because CSS found a vaguely similar system face.

## Policy

- SIL Open Font License 1.1 only for the initial public library.
- Latin and Latin Extended resources are locked where the upstream package provides them.
- Every family must expose at least one useful display or body role.
- Browser preview and presentation-application support are separate claims.
- A family with missing files, license text or provenance is ineligible.

## Records

`curation.v1.json` describes the eight editorial shelves and human intent. `font-library.lock.json` records acquisition facts. Each family directory contains its WOFF2 files and upstream `OFL.txt`; `FONT-CREDITS.md` names the makers in one readable table.

## Refreshing the library

```sh
npm run type-library:sync
npm run type-library:validate
npm run check
```

Sync deliberately replaces the generated library from the pinned curation policy. Review the lock diff. A green hash check proves file identity and license presence; it does not prove that a deck recipient has the font installed or that an authoring application handles every axis correctly.

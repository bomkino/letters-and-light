# What is licensed as what

Open source works better when the small print is not a scavenger hunt.

## MIT

Unless a file says otherwise, project-authored code, copy, documentation, structured data and non-brand artwork are released under the repository’s [MIT License](LICENSE). That includes the Letters & Light engines, interface, test suite, optical still life and film-grain texture.

## SIL Open Font License 1.1

Every font in `public/fonts/type-library/<family>/` remains the work of its named designer and retains the adjacent `OFL.txt`. The repository does not relicense those fonts.

`data/type-library/font-library.lock.json` records each family’s designer, upstream source, license URL, local license hash and exact WOFF2 hashes. `public/fonts/type-library/FONT-CREDITS.md` is the human-readable index.

## pitch.dog marks

`public/assets/brand/RectangleA_logomark-fullcolor-rgb.svg`, the names **pitch.dog** and **Letters & Light**, and their associated identity are not granted under MIT. You may keep the attribution in unmodified copies of this project. Do not use the marks to imply endorsement, authorship or an official pitch.dog release of a fork. See [TRADEMARKS.md](TRADEMARKS.md).

## Dependencies

JavaScript dependencies keep their own licenses. Their names and pinned versions live in `package-lock.json`; the repository license does not replace them.

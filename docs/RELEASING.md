# Releasing

1. Run `npm ci` from a clean checkout.
2. Run `npm run check`.
3. Review the public asset and font-license diffs.
4. Test keyboard, system theme, reduced motion, upload/paste, Type shuffle/locks, Color corrections and every export in a current browser.
5. Tag the checked commit with semantic versioning.
6. Build and deploy that exact commit.
7. Verify the public URL and record the deployment against the tag.

A successful build is necessary. It is not, by itself, a release.

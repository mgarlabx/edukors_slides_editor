# Contributing

Thanks for your interest. Bug reports, suggestions and pull requests are welcome.

## Reporting bugs

Open an [issue](https://github.com/mgarlabx/edukors_slides_editor/issues) with the version (bottom right of the window), the operating system, the steps to reproduce and, if possible, a small `.esf` file that shows the problem. Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Pull requests

1. For anything beyond a small fix, open an issue first so we can agree on the approach.
2. Follow the existing code style: compact, several statements per line, few comments (only where the reason is not obvious). Match the surrounding code rather than reformatting it.
3. Interface text goes in the three catalogs of `src/ui/i18n.ts` (`pt`, `en`, `es`).
4. Before submitting, run:

   ```sh
   node node_modules/typescript/bin/tsc --noEmit
   node scripts/test.mjs
   node scripts/build.mjs
   node scripts/e2e.mjs --without-legacy-canvas
   ```

   The tests use simulated AI CLIs and never call a real account.
5. Default templates must stay neutral: no logos, brand names, slogans or URLs.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).

# Contributing to quiz1v1

Thanks for wanting to help. quiz1v1 is built by [Prem2310](https://github.com/Prem2310) and contributions are welcome:
bug reports, ideas, new topic content, accessibility fixes and code.

## Ways to help

- **Report a bug or suggest an idea** by [opening an issue](https://github.com/Prem2310/QuizIt/issues). For a bug,
  say what you did, what you expected and what happened; a screenshot and your browser help.
- **Improve the explainer pages** in `artifacts/quizit/src/content/topics.ts` (original writing only, see below).
- **Fix or build something.** For anything larger than a small fix, open an issue first so we can agree on the
  approach before you spend time on it.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Set it up as described in the [README](README.md#run-it-locally).
3. Keep the change focused: one idea per pull request, with a description of what and why.
4. Run the checks before you push:

   ```bash
   pnpm run typecheck
   pnpm --filter @workspace/quizit run build
   cd artifacts/api-server && python -m pytest
   ```

5. Open a pull request against `main`.

## Guidelines

- **UI:** follow [`artifacts/quizit/DESIGN.md`](artifacts/quizit/DESIGN.md): use the existing colour tokens and
  components rather than one-off values, keep glows to hover/selection states, and keep keyboard focus visible.
  Check your change at phone width (about 360 to 390 px) as well as desktop.
- **Accessibility:** controls need names, forms need labels, and colour must not be the only signal.
- **API changes:** edit `lib/api-spec/openapi.yaml`, then regenerate the clients with
  `pnpm --filter @workspace/api-spec run codegen`. Do not hand-edit generated files.
- **Tests:** add a backend test for backend behaviour. The suite runs on a throwaway SQLite database.
- **Secrets:** never commit `.env` files, tokens or database URLs.
- **Content:** write topic guidance in your own words. Do not paste questions or text from other sites; the
  question bank is sourced from [IndiaBix](https://www.indiabix.com) and is not covered by this project's license.

## License

By contributing you agree that your contribution is released under the [MIT License](LICENSE), the same as the
rest of the code.

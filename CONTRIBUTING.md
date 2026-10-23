# Contributing

Thanks for your interest in Daily on Dot.

- Open an issue to report a bug or propose a change before you start large work.
- Send changes as a pull request against the default branch. Keep each pull request to one change.
- Run the checks before you push:

  ```sh
  pnpm install
  pnpm --filter daily-on-dot-prototype test
  pnpm --filter daily-on-dot-prototype exec tsc --noEmit
  cargo test --manifest-path contracts/logic/Cargo.toml
  ```

- Do not commit keys, seed phrases or `.env` files.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

// Product manifest for publishing Daily on Dot as an on-chain Polkadot product:
//
//   pnpm pocket:build && pnpm --filter daily-on-dot-prototype build
//   DEPLOY_DOMAIN=dailyondot.paseo bulletin-deploy --config deploy/bulletin-deploy.config.ts \
//     app/dist dailyondot.paseo
//   DEPLOY_DOMAIN=dailyondot.paseo MNEMONIC=... pnpm pocket:publish -- --env <env>
//
// Two executables: the app (the games, opened beneath the card) and the worker
// (draws the card). `domain` must equal the CLI's positional domain verbatim,
// TLD included. This file lives outside the build dirs on purpose:
// bulletin-deploy auto-discovers a config by walking up from the build dir,
// and must not pick this one up for a bare-label deploy.
//
// bulletin-deploy up to 0.22.0 writes the worker record's `$v`, `kind`,
// `appVersion`, `entrypoint` and `includes`, and DROPS `pocket` without a
// word (its composeExecutable; checked in 0.22.0's dist). A host asks the
// worker to draw only once `worker.<label>.<tld>` lists the card, so
// `tools/publish-pocket-cards.mts` adds `pocket.cards` back after a deploy.
// 0.23.0 (2026-10-18) keeps `pocket` on the record and validates the cards;
// the publish tool then reads back an already-complete record and writes
// nothing. (Finding shared with paritytech/humanity-spa and Nemanja's pets.)
const domain = process.env.DEPLOY_DOMAIN;
if (!domain) {
  throw new Error("DEPLOY_DOMAIN is required, e.g. DEPLOY_DOMAIN=dailyondot.paseo");
}

const appVersion: [number, number, number] = [0, 1, 0];

export default {
  domain,
  displayName: "Daily on Dot",
  description: "Six daily puzzle games, one checklist, scores on chain.",
  // bulletin-deploy requires an icon path (512x512 checklist glyph).
  icon: { path: "../app/public/icon.png", format: "png" as const },
  executables: [
    { kind: "app" as const, path: "../app/dist", appVersion },
    {
      kind: "worker" as const,
      path: "../pocket/dist",
      appVersion,
      entrypoint: "worker.js",
      includes: { chat: false, pocket: true },
      // `preview` is a path inside this worker's published folder, drawn on
      // the add sheet before the worker runs. A host refuses a URL here.
      pocket: {
        cards: [{ id: "daily", title: "Daily on Dot", preview: "faces/daily.json" }],
      },
    },
  ],
};

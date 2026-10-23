// Product manifest for publishing Daily on Dot as an on-chain Polkadot product:
//
//   pnpm pocket:build && pnpm --filter daily-on-dot-prototype build
//   DEPLOY_DOMAIN=dailyondot.paseo bulletin-deploy --config deploy/bulletin-deploy.config.ts \
//     app/dist dailyondot.paseo
//
// Two executables: the app (the games, opened beneath the card) and the worker
// (draws the card). `domain` must equal the CLI's positional domain verbatim,
// TLD included. This file lives outside the build dirs on purpose:
// bulletin-deploy auto-discovers a config by walking up from the build dir,
// and must not pick this one up for a bare-label deploy.
//
// A host asks the worker to draw only once `worker.<label>.<tld>` lists the
// card. bulletin-deploy 0.23.0 (the repo pin) writes `pocket` on the record
// and validates the cards; 0.22.0 and older dropped it, so do not downgrade.
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

# Releasing the Ogen Figma plugin

How to ship the plugin to the Figma Community, both the first time and for
every update after that. The first listing is tracked in
[CON-341](https://linear.app/ogen/issue/CON-341).

> **One rule above all:** Figma publishes `manifest.json` and the `dist/`
> files **exactly as they are on your disk** when you click Publish. Publish
> only the files the Release workflow built for the tag (step 2), never a
> local build. A dev build points at `http://localhost:9001` and would break
> the plugin for every user.

## How releases work

- **CI builds, a person publishes.** Pushing a `v<version>` tag runs
  [`.github/workflows/release.yml`](.github/workflows/release.yml): checks,
  `npm run build:prod`, `npm run verify:release`, and a **draft** GitHub
  release with `ogen-figma-plugin-v<version>.zip` (`manifest.json`,
  `dist/code.js`, `dist/ui.html`) and `SHA256SUMS`. Figma has no publish
  API, so the publish itself happens in the Figma desktop app, by an account
  that has publish rights on the plugin.
- **Only the first publish is reviewed.** Figma reviews a new plugin before
  listing it, and approval time depends on their queue. Once the plugin is
  approved, updates go live for every user as soon as you publish them, with
  no further review.
  [Figma: manage plugins](https://help.figma.com/hc/en-us/articles/360042293714-Manage-classic-plugins-as-a-developer)
- **Users always run the latest version.** They can't stay on or go back to
  an older one. To roll back, publish an older build as a new version (see
  [Rolling back](#rolling-back)).
- **Each build is tied to one API.** The Ogen API origin is compiled into the
  bundle (`__API_BASE__`) and must be listed in `manifest.json` →
  `networkAccess.allowedDomains`, which Figma enforces. Production allows
  `https://api.getogen.com` and Ogen's storage, `https://assets.getogen.com`.
  The Community listing shows these domains under "Network access".

## Versioning

- `package.json` → `version` follows semver and is the release's identity in
  git (`v<version>` tags) and in Figma's release notes. The Release workflow
  refuses a tag that doesn't match it.
  - **patch:** fixes, copy changes
  - **minor:** new options or screens
  - **major:** a change that needs a newer Ogen API
- Figma keeps its own version counter, which we don't control. Start the
  Figma release notes with the semver version so the two can be matched.
- The plugin and the API are released separately, so a plugin release must
  only depend on API endpoints that are **already in production**.

## Prerequisites

### Once, before the first publish

- [ ] **Backend is in production.** CON-338 is merged and deployed, and
      `https://api.getogen.com/api/plugins/figma/*` answers. Check that a
      preflight from origin `null` is allowed:
      ```sh
      curl -si -X OPTIONS https://api.getogen.com/api/plugins/figma/pairings \
        -H 'Origin: null' -H 'Access-Control-Request-Method: POST' \
        -H 'Access-Control-Request-Headers: content-type' | grep -i access-control
      ```
      Expect `Access-Control-Allow-Origin: *`.
- [ ] **Storage is served from `assets.getogen.com`.** The plugin uploads
      videos to Ogen's storage and downloads post media from it for campaign
      boards, through short-lived signed URLs the API issues, from origin
      `null`. Figma only lets it reach `https://assets.getogen.com`, so every
      signed URL the production API hands the plugin (video presign, board
      media) must be on that host: R2's own presigned URLs live on
      `<account>.r2.cloudflarestorage.com`, which a published plugin can't
      reach (CON-543). `assets.getogen.com` must answer CORS for the plugin:
      `Access-Control-Allow-Origin: *`, methods `PUT, GET`, header
      `content-type`. `*` is safe here: the signed URL is already the
      credential, and no cookies are involved. Without `GET`, board media
      fails with "No 'Access-Control-Allow-Origin' header" in the plugin
      console. Without `PUT`, video sends fail with "Could not reach Ogen
      storage". Check it (no signed URL needed):
      ```sh
      curl -si -X OPTIONS 'https://assets.getogen.com/cors-check' \
        -H 'Origin: null' -H 'Access-Control-Request-Method: PUT' \
        -H 'Access-Control-Request-Headers: content-type' | grep -i access-control
      ```
      Expect `Access-Control-Allow-Origin: *` and
      `Access-Control-Allow-Methods` listing `PUT, GET`.
- [ ] **Approval page is in production.** CON-339 is deployed, and the API's
      `APP_BASE_URL` points at it, so `approve_url` opens
      `https://app.getogen.com/integrations/figma/connect?key=…`.
- [ ] **API origin is confirmed.** If production is not
      `https://api.getogen.com`, update `allowedDomains` in `manifest.json`
      and `DEFAULT_API.prod` in `scripts/origins.mjs` together.
- [ ] **Spikes are recorded** in [docs/spikes.md](docs/spikes.md). In
      particular, the Dev Mode result decides `editorType` (and
      `capabilities: ["inspect"]`).
- [ ] **Publisher account is ready.** It has two-factor authentication
      enabled (Figma requires 2FA to publish) and uses the Figma desktop app
      on macOS or Windows.
- [ ] **Publishing profile is chosen.** Publish under the shared Ogen team or
      organization profile, not a personal one. The publisher becomes the
      owner, and a public plugin can't be moved to another owner later.
      Invite the other maintainers as contributors so more than one person
      can publish updates.
- [ ] **Plugin id is real.** In Figma desktop, go to **Plugins → Development
      → New plugin…**, create a plugin, and copy the generated `id` into
      `manifest.json`, replacing the `ogen-send-to-ogen` placeholder. Commit
      that change. The id never changes after this, so never regenerate it.
      `verify:release` (and so the Release workflow) fails until it is set.
- [ ] **Listing assets are ready.** See [Community listing](#community-listing).

### Every release

- [ ] All changes for the release are merged to `main` and CI is green.
- [ ] Every API endpoint the release relies on is deployed to production.
- [ ] `package.json` → `version` is bumped (in its own PR or the last
      feature PR).

## Release steps

### 1. Tag the release

```sh
git checkout main && git pull --ff-only
git status --porcelain            # must print nothing
git tag -a v$(node -p "require('./package.json').version") -m "Figma Community release"
git push origin v$(node -p "require('./package.json').version")
```

The **Release** workflow (GitHub → Actions) runs the checks, builds for
production, verifies the bundle and creates a draft release. If it fails, fix
it on `main`, delete the tag (`git push origin :refs/tags/v<version>` and
`git tag -d v<version>`), and tag again.

### 2. Get the release build

1. Download `ogen-figma-plugin-v<version>.zip` and `SHA256SUMS` from the
   draft release.
2. Unzip it **over a clean checkout of the tag**, so `manifest.json` and
   `dist/` sit where the development plugin already points:
   ```sh
   git checkout v<version>
   unzip -o ~/Downloads/ogen-figma-plugin-v<version>.zip
   shasum -a 256 -c ~/Downloads/SHA256SUMS --ignore-missing   # all OK
   npm run verify:release -- --tag v<version>                  # [verify] ok
   ```

`verify:release` checks that the manifest has the real plugin id and only
production domains, that the bundle calls `https://api.getogen.com` and
mentions no development origin, and that the dev-only console readout is
stripped. `devAllowedDomains` (localhost, `https://api.dev.getogen.com` and
the R2 API host the dev environment still signs on) stays in the manifest.
Figma ignores it for published plugins.

### 3. Smoke-test the production build

1. In Figma desktop, go to **Plugins → Development → Import plugin from
   manifest…**, pick the checkout's `manifest.json` (from step 2), then run
   **Plugins → Development → Ogen**. If the plugin was imported before,
   running it again loads the new `dist/`.
2. Use a **test workspace** in production. Don't use a customer workspace.
3. Walk through this checklist:
   - [ ] **Connect:** the browser opens the production approval page, you
         click Allow, and the plugin shows "Sending to <workspace>".
   - [ ] **Send to the bank:** send 3 frames (PNG at 2×). They appear in the
         content bank with `origin=figma` and generated alt text.
   - [ ] **Dedupe:** re-send the same frames unchanged. Each shows "Already
         in Ogen".
   - [ ] **Campaign tree:** Campaigns lists the workspace's campaigns
         (archived ones hidden). Posts are grouped by date in each campaign's
         timezone, and those dates match the web app. Scheduled and published
         posts are greyed out.
   - [ ] **Send to a campaign post:** the image is attached to the post.
   - [ ] **Locked post:** sending to a submitted post shows "not attached",
         and the image is still in the bank.
   - [ ] **JPG and 3×:** export works, and the size shown matches the asset.
   - [ ] **Too large:** a frame over 100 MP at the chosen scale is flagged
         and skipped.
   - [ ] **Video:** send an animated frame as MP4 to a post that takes
         video. It's attached, which also proves storage allows `PUT`.
   - [ ] **Board media:** create a board for a campaign whose posts have
         images. They appear in the placeholders with "Image from Ogen",
         which also proves storage allows `GET`.
   - [ ] **Disconnect:** the menu → Disconnect returns to Connect, and the
         connection disappears from Ogen settings.
   - [ ] **Revoke from Ogen:** reconnect, revoke the connection in Ogen
         settings, then send. The plugin returns to Connect with
         "Disconnected from Ogen."
   - [ ] **Theme:** the UI is readable in both Figma light and dark mode.
   - [ ] **Console:** the plugin console (**Plugins → Development →
         Show/Hide console**) shows no errors.
4. Clean up the test assets and connections.

### 4. Publish

**First release:**

Publish from the checkout of step 2, the same files you smoke-tested.

1. In Figma desktop, open any file, then go to Figma menu → **Plugins →
   Manage plugins**.
2. Select **Ogen** and click **Publish**.
3. Fill in the form from [Community listing](#community-listing): name,
   tagline, description, category, icon, thumbnail and carousel, support
   contact, contributors, and the publishing profile (the Ogen team or
   organization).
4. Fill in the **security disclosure form**. It is optional, but fill it
   in: it helps users and reviewers trust the plugin. See
   [Data and security answers](#data-and-security-answers).
5. Submit. The listing shows **In review** until Figma approves it.
   Approval time varies with their queue. You can still publish fixes while
   the plugin is in review. If Figma rejects it, fix the feedback and
   resubmit. A fix is a new version and tag (steps 1–3), never a local
   build.

**Updates:**

1. Go to Figma menu → **Plugins → Manage plugins**, open the menu next to
   **Ogen**, and choose **Publish new version**.
2. Write the **Release notes**, starting with the version
   (`v0.2.0 — …`), and end-user facing. The draft GitHub release lists the
   merged PRs to start from.
3. Click **Publish**. The update reaches every user immediately.

### 5. After publishing

- Put the Figma release notes into the draft GitHub release and **publish
  it**. Its zip holds the exact published files, for a rollback later.
- `git checkout main` in the checkout you published from.
- Install the plugin from its Community page (not the development copy) and
  run it once. Check that Connect works and one frame sends.
- Update the Linear issue: add the Community URL
  (`https://www.figma.com/community/plugin/<id>/…`) for the first release,
  or the version for an update.
- Watch for a day:
  - API errors on `/api/plugins/figma/*` (Sentry, access logs)
  - the plugin activity events (`plugin_connected`, `plugin_image_sent`)
  - the pairing and upload counters

## Rolling back

Users can't pin an old version, so a rollback is a new publish of a known
good build:

1. Do step 2 with the last good GitHub release: check out its tag and unzip
   its `ogen-figma-plugin-v<version>.zip` over it. Don't rebuild: the zip is
   what users ran.
2. `npm run verify:release` will reject an old release that predates the
   real plugin id or a domain change; then don't roll back past it. Run a
   short smoke test.
3. Publish it with **Publish new version**, with release notes such as
   `v0.2.1 — reverts v0.2.0 (…)`.
4. Fix forward on `main`, then release as usual.

Unpublishing is the last resort, for when the plugin is causing harm (for
example, uploading to the wrong place) and no good build can go out quickly.
Know what it does before you use it
([Figma: manage plugins](https://help.figma.com/hc/en-us/articles/360042293714-Manage-classic-plugins-as-a-developer)):

- Everyone who installed the plugin loses it immediately, with no
  notification, and the Community listing goes away.
- The listing details (title, tagline, description and so on) are lost and
  must be entered again when you republish. Likes and installs are kept.
- The plugin stays in development on the publisher's account, so it can be
  published again.

Prefer publishing a known-good build (above): users keep working and the
listing stays intact. If you do unpublish, do it from **Manage plugins**,
and keep a copy of the listing copy (see [Community listing](#community-listing))
so republishing is quick. Never **delete** the plugin: deletion can't be
undone and also loses its installs and likes.

## Community listing

Keep the copy and artwork in version control, for example under
`docs/community/`, so updates to the listing get reviewed like code.

| Field | Value / spec |
| -- | -- |
| Name | Ogen |
| Tagline | Send frames to your Ogen content bank or a campaign post in one click |
| Description | What it does, the one-time Connect step, what gets sent (PNG/JPG at 1–3×, frame name and file name), and that SVG isn't supported |
| Category | Design tools (or the closest marketing/export category Figma offers) |
| Icon | `assets/icon-128.png` (128 × 128, rendered from `assets/icon.svg`). Figma's manifest has no icon field, so the icon only appears once it's uploaded here; development builds show Figma's default icon |
| Thumbnail | 1920 × 1080 px |
| Carousel | Up to 9 images or videos: Connect, Send screen, campaign tree, Result |
| Support contact | A shared support address or URL, not a personal one |
| Network access | Shown automatically from `allowedDomains` (`api.getogen.com`, `assets.getogen.com`) |
| Contributors | Ogen maintainers who may publish updates |
| Playground file | Optional: a sample file with a few frames to try |

### Data and security answers

Facts for the security disclosure form:

- **Data sent:** the PNG/JPG render of the selected frames, the frame name
  and node id, and the Figma file name. Nothing else from the document is
  read or sent.
- **Where it goes:** only Ogen: the Ogen API (`api.getogen.com`) and Ogen's
  storage (`assets.getogen.com`), which videos are uploaded to and board
  media is downloaded from, through short-lived signed URLs the API issues. The plugin has no third-party services and no analytics.
- **Authentication:** a one-time pairing in the browser gives the plugin a
  revocable token, scoped to one Ogen workspace. The token can only upload
  images and list campaign and post titles (never post text).
- **Storage:** the token and the user's format and scale preference are kept
  in `figma.clientStorage` on the user's machine. Nothing is stored on
  Figma's servers.
- **Figma permissions:** `currentuser`, used only to label the connection
  "Figma · <name>" on the approval page.
- **Revoking access:** use Disconnect in the plugin, or revoke the
  connection in Ogen settings.

## Non-production builds

- **Dev environment:** `npm run build:dev:remote` (or `dev:remote` to watch)
  builds against `https://api.dev.getogen.com`, which is in
  `devAllowedDomains`. Import it as a development plugin. A production build
  refuses this origin, and published plugins ignore `devAllowedDomains`, so
  a dev-environment build can't reach users even by mistake.
- **Dev storage:** the dev environment still signs storage URLs on
  `<account>.r2.cloudflarestorage.com`, so `https://*.r2.cloudflarestorage.com`
  is in `devAllowedDomains` for development builds only. Drop it once dev
  moves to its own assets host too (CON-543).
- **Other environments:** add the origin to `devAllowedDomains`, never to
  `allowedDomains`, which is for production only.
- **Sharing a test build:** a development plugin only runs for the person
  who imported it. Anyone else who wants to test should clone the repo,
  build, and import `manifest.json`.

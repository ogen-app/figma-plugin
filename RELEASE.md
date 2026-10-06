# Releasing the Ogen Figma plugin

How to ship the plugin to the Figma Community, both the first time and for
every update after that. The first listing is tracked in
[CON-341](https://linear.app/ogen/issue/CON-341).

> **One rule above all:** Figma publishes `manifest.json` and the `dist/`
> files **exactly as they are on your disk** when you click Publish. Always
> rebuild with `npm run build:prod` from a clean `main` right before
> publishing. A dev build points at `http://localhost:9001` and would break
> the plugin for every user.

## How releases work

- **There is no CI deploy.** A person publishes from the Figma desktop app,
  using a Figma account that has publish rights on the plugin.
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
  `networkAccess.allowedDomains`, which Figma enforces. The Community listing
  shows these domains under "Network access".

## Versioning

- `package.json` → `version` follows semver and is the release's identity in
  git (`v<version>` tags) and in Figma's release notes.
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
- [ ] **Approval page is in production.** CON-339 is deployed, and the API's
      `APP_BASE_URL` points at it, so `approve_url` opens
      `https://app.getogen.com/integrations/figma/connect?key=…`.
- [ ] **API origin is confirmed.** If production is not
      `https://api.getogen.com`, update `allowedDomains` in `manifest.json`
      and `DEFAULT_API.prod` in `scripts/build.mjs` together.
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
- [ ] **Listing assets are ready.** See [Community listing](#community-listing).

### Every release

- [ ] All changes for the release are merged to `main` and CI is green.
- [ ] Every API endpoint the release relies on is deployed to production.
- [ ] `package.json` → `version` is bumped (in its own PR or the last
      feature PR).

## Release steps

### 1. Build from a clean checkout

```sh
git checkout main && git pull --ff-only
git status --porcelain            # must print nothing
npm ci
npm run check                     # typecheck + unit tests
npm run build:prod
```

### 2. Verify the bundle

```sh
# Production API is baked in, and nothing points at localhost
grep -c 'https://api.getogen.com' dist/ui.html      # ≥ 1
grep -c 'localhost' dist/ui.html dist/code.js       # 0 and 0

# The dev-only console readout is stripped
grep -c '\[ogen\] editorType' dist/code.js          # 0

# The manifest has the real id and the production domain
node -e "const m=require('./manifest.json'); console.log(m.id, m.networkAccess.allowedDomains)"
```

`devAllowedDomains` (localhost and `https://api.dev.getogen.com`) stays in
the manifest. Figma ignores it for published plugins.

### 3. Smoke-test the production build

1. In Figma desktop, go to **Plugins → Development → Import plugin from
   manifest…**, pick `manifest.json`, then run **Plugins → Development →
   Ogen**. If the plugin was imported before, running it again loads the new
   `dist/`.
2. Use a **test workspace** in production. Don't use a customer workspace.
3. Walk through this checklist:
   - [ ] **Connect:** the browser opens the production approval page, you
         click Allow, and the plugin shows "Sending to <workspace>".
   - [ ] **Send to the bank:** send 3 frames (PNG at 2×). They appear in the
         content bank with `origin=figma` and generated alt text.
   - [ ] **Dedupe:** re-send the same frames unchanged. Each shows "Already
         in Ogen".
   - [ ] **Send to a draft post:** the image is attached to the post.
   - [ ] **Locked post:** sending to a submitted post shows "not attached",
         and the image is still in the bank.
   - [ ] **JPG and 3×:** export works, and the size shown matches the asset.
   - [ ] **Too large:** a frame over 100 MP at the chosen scale is flagged
         and skipped.
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
   resubmit.

**Updates:**

1. Go to Figma menu → **Plugins → Manage plugins**, open the menu next to
   **Ogen**, and choose **Publish new version**.
2. Write the **Release notes**, starting with the version
   (`v0.2.0 — …`), and end-user facing.
3. Click **Publish**. The update reaches every user immediately.

### 5. After publishing

```sh
git tag -a v$(node -p "require('./package.json').version") -m "Figma Community release"
git push origin --tags
```

- Create a GitHub release from the tag, using the same notes. Attach
  `dist/code.js`, `dist/ui.html` and `manifest.json` from this build, so the
  exact published files can be republished later.
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

1. Download `code.js`, `ui.html` and `manifest.json` from the last good
   GitHub release into `dist/` and the repo root. Alternatively, check out
   its tag and run `npm ci && npm run build:prod`.
2. Run step 2 (verify the bundle) and a short smoke test.
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
| Tagline | Send frames to your Ogen content bank or a draft post in one click |
| Description | What it does, the one-time Connect step, what gets sent (PNG/JPG at 1–3×, frame name and file name), and that SVG isn't supported |
| Category | Design tools (or the closest marketing/export category Figma offers) |
| Icon | 128 × 128 px |
| Thumbnail | 1920 × 1080 px |
| Carousel | Up to 9 images or videos: Connect, Send screen, draft-post picker, Result |
| Support contact | A shared support address or URL, not a personal one |
| Network access | Shown automatically from `allowedDomains` (`api.getogen.com`) |
| Contributors | Ogen maintainers who may publish updates |
| Playground file | Optional: a sample file with a few frames to try |

### Data and security answers

Facts for the security disclosure form:

- **Data sent:** the PNG/JPG render of the selected frames, the frame name
  and node id, and the Figma file name. Nothing else from the document is
  read or sent.
- **Where it goes:** only the Ogen API (`api.getogen.com`). The plugin has
  no third-party services and no analytics.
- **Authentication:** a one-time pairing in the browser gives the plugin a
  revocable token, scoped to one Ogen workspace. The token can only upload
  images and list draft-post titles.
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
- **Other environments:** add the origin to `devAllowedDomains`, never to
  `allowedDomains`, which is for production only.
- **Sharing a test build:** a development plugin only runs for the person
  who imported it. Anyone else who wants to test should clone the repo,
  build, and import `manifest.json`.

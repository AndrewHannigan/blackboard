---
name: release
description: Cut a new Blackboard release — bump the version, tag it, and let GitHub Actions build/publish the apps and update the Homebrew tap. Use when asked to "bump the release", "cut a release", "ship a new version", or publish Blackboard.
---

# Releasing Blackboard

A Blackboard release is triggered by **pushing a `vX.Y.Z` git tag to `main`**.
The tag fires `.github/workflows/release.yml` (workflow name: **Release**), which
runs four jobs: `build-mac`, `build-windows`, `build-linux`, and `release`. The
`release` job creates the GitHub Release with all artifacts and then updates the
Homebrew cask in `AndrewHannigan/homebrew-tap`.

There is an interactive helper (`npm run release` → `scripts/release.sh`), but it
prompts for input and is awkward to drive as an agent. Prefer the explicit steps
below.

## 1. Pre-flight

Release from a clean, up-to-date `main`. If the repo is also checked out
elsewhere, use a repocache workspace so commits land in the right clone.

```bash
git checkout main
git pull --ff-only origin main
git status --short                       # must be empty
node -p "require('./package.json').version"   # current version
```

Pick the new version. Default to a **patch** bump unless told otherwise.

## 2. Bump, commit, tag, push

```bash
npm version <X.Y.Z> --no-git-tag-version       # edits package.json only
git commit -aqm "Release v<X.Y.Z>"
git tag -a v<X.Y.Z> -m "Release v<X.Y.Z>"
git push origin main
git push origin v<X.Y.Z>                        # <- this tag push starts the release
```

## 3. Watch the workflow

With `gh`:

```bash
gh run watch --repo AndrewHannigan/blackboard
```

If `gh` is not installed, query the API. The local git credential for
github.com works as a bearer token:

```bash
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/AndrewHannigan/blackboard/actions/runs?per_page=1"
# then .../actions/runs/<id>/jobs for per-job status, or .../jobs/<id>/logs for logs
```

## 4. Verify

- GitHub Release `v<X.Y.Z>` exists (not a draft) with **5 assets**:
  `-arm64.dmg`, `-arm64.zip`, `-linux-amd64.deb`, `-linux-x86_64.AppImage`, `-win.exe`.
- Homebrew cask `AndrewHannigan/homebrew-tap` → `Casks/blackboard.rb` shows the new
  `version` and a matching `sha256`.

## Known failure: "Update Homebrew Tap" auth error

The `release` job's last step clones homebrew-tap with the `TAP_GITHUB_TOKEN`
repo secret. If that secret is expired/missing the step fails with:

```
fatal: Authentication failed for '.../homebrew-tap.git'
```

The builds and the GitHub Release still succeed — **only the Homebrew cask is left
stale**, so `brew upgrade blackboard` won't pick up the new version.

**Permanent fix (needs repo admin):** set a valid `TAP_GITHUB_TOKEN` Actions
secret on the blackboard repo — a PAT with write access to `homebrew-tap`
(classic `repo` scope, or fine-grained with Contents: write on homebrew-tap) —
then re-run the failed workflow.

**Manual workaround for the current release** (update the cask by hand):

```bash
# 1. hash the published mac zip
curl -sSL -o /tmp/bb.zip \
  "https://github.com/AndrewHannigan/blackboard/releases/download/v<X.Y.Z>/Blackboard-<X.Y.Z>-arm64.zip"
shasum -a 256 /tmp/bb.zip

# 2. in homebrew-tap Casks/blackboard.rb set:
#      version "<X.Y.Z>"
#      sha256  "<hash from step 1>"
#    then commit "Update blackboard to v<X.Y.Z>" and push to main.
```

(The cask `url` already interpolates `#{version}`, so only `version` and `sha256`
need to change.)

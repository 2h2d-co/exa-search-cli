# exa-search-cli Project Instructions

exa-search-cli is an unofficial, zero-runtime-dependency CLI for the Exa Search and Contents APIs.

## Conventions

- Format commit messages according to [Conventional Commits](https://www.conventionalcommits.org/).
- Maintain `CHANGELOG.md` using the [Keep a Changelog](https://keepachangelog.com/) style.
- Add changelog entries for changes whose commit would be `feat:` or `fix:`; keep entries under `Unreleased` until a release is made.
- Release commits should do the following:
  - update the package version;
  - keep changelog entries under `Unreleased` for prereleases and move them into a release section only for stable releases;
  - use `npm run release -- X.Y.Z` to build the package locally, create an SSH-signed `release: vX.Y.Z` commit containing its `Npm-Artifact-SHA256` trailer, verify a clean rebuild, and create the matching lightweight tag;
  - push the release commit and tag atomically; do not use `git tag -a`, `git tag -s`, `git tag -m`, or `cog bump --annotated`.

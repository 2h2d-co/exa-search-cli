# exa-search-cli Project Instructions

exa-search-cli is an unofficial, zero-runtime-dependency CLI for the Exa Search and Contents APIs.

## Conventions

- Format commit messages according to [Conventional Commits](https://www.conventionalcommits.org/).
- Maintain `CHANGELOG.md` using the [Keep a Changelog](https://keepachangelog.com/) style.
- Add changelog entries for changes whose commit would be `feat:` or `fix:`; keep entries under `Unreleased` until a release is made.
- Release commits should do the following:
  - update the package version;
  - move `Unreleased` changelog entries into the new release section;
  - commit with `release: vX.Y.Z` as the commit message;
  - create a lightweight tag named `vX.Y.Z` with `git tag vX.Y.Z`; do not use `git tag -a`, `git tag -s`, `git tag -m`, or `cog bump --annotated`.

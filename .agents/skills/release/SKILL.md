---
name: release
description: Cut a SemVer release (develop → main + vX.Y.Z tag). Only when the maintainer (Cristian) asks for a release.
---

# Release

1. Decide the bump from commits since the last tag (`git log vPREV..develop --oneline`): `feat` → minor, `fix` → patch, breaking → major (minor while 0.x).
2. Branch `chore/release-vX.Y.Z` from `develop`: move `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`, bump `package.json`. PR to `develop`.
3. After merge: PR `develop` → `main` titled `release: vX.Y.Z`. The maintainer merges.
4. Maintainer tags `main`: `git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z`. Agents never push tags unless explicitly told.
5. Check the `release` workflow run and the GitHub Release notes.

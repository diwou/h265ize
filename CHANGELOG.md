# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.2]

### Fixed
- Fixed global npm installation by shipping `patch-package` as a runtime dependency instead of a dev-only dependency.
- Pinned `fluent-ffmpeg` to the patched `2.1.2` release so fresh installs receive the exact version covered by the maintained compatibility patch.

## [0.6.1]

### Changed
- Updated npm package metadata to use the clearer maintained-fork description and a more relevant keyword set.
- Documented the real npm installation path in the README for the published package `@diwou/h265ize`.
- Cleaned up `package.json` test and `bin` entries so future npm publishes do not need automatic metadata correction.

## [0.6.0]

### Added
- Maintenance fork baseline with `AGENTS.md`, `.editorconfig`, and cleaned up project scaffolding.
- Reproducible vendor patch under `patches/` for `fluent-ffmpeg` so local installs keep working with current `ffmpeg` output.
- Focused regression tests for helper metadata handling and output-relative stream mapping.
- Focused regression tests for `loudnorm` summary parsing and crop-detection stderr parsing.

### Changed
- Reworked the README around the maintenance-fork status and local development workflow.
- Prepared project metadata for an independent maintained fork without outdated upstream repository links.
- Pointed package and documentation metadata at the active Codeberg repository for this fork.
- Added a direct README reference to the original upstream GitHub repository for historical context.
- Prepared the first maintained fork release as `0.6.0` and aligned package metadata with the planned scoped npm package name `@diwou/h265ize`.
- Normalized `.gitignore` for Node.js, VSCodium, and local project artifacts.
- Added a `patch-package`-based `postinstall` step to `package.json` so local dependency fixes are reapplied automatically.
- Standardized package management in the fork on `npm`.

### Fixed
- Resolved the first concrete `ffmpeg 8` compatibility break: the old `fluent-ffmpeg` format detection now recognizes the `null` muxer again, so crop detection and other analysis paths no longer abort immediately.
- Updated the bundled `fluent-ffmpeg` filter detection so current `ffmpeg` filter listings are parsed correctly again, restoring analysis paths that depend on filters such as `volumedetect`.
- Corrected stream metadata and default flags on mapped output streams: auto-generated audio titles no longer contain embedded quotes, and default audio/subtitle flags now use output-relative instead of input-relative stream indices.
- Repaired the normalization path for modern `ffmpeg` by switching invalid stream-specifier options to output-relative audio options, allowing `--normalize-level 3` runs to complete again.
- Repaired the `loudnorm` normalization path for current `ffmpeg` by parsing JSON summaries robustly and re-encoding filtered audio streams instead of trying to combine filters with stream copy.
- Hardened interlace detection by parsing current `idet` output more defensively, so deinterlacing no longer fails on newer `ffmpeg` stderr layouts.
- Corrected `idet` stream mapping so multi-video inputs analyze the selected video stream instead of failing with broad `-map v` behavior.
- Made the fast crop-detection path more reliable on current `ffmpeg` by switching sampled seeks to a short output-side analysis window and using the last detected crop result instead of immediately falling back on sparse seeks.
- Made temporary-file cleanup more robust by ignoring already-missing files instead of raising follow-up `ENOENT` errors after failed runs.
- Fixed helper handling for missing stream `tags`, so title and language normalization no longer throw on incomplete ffprobe metadata.
- Removed the outdated version lookup via `local-git-sync` and replaced it with direct `git` calls, eliminating the large ShellJS warning flood on current Node versions during normal startup.
- Replaced the outdated `winston`-based logger with a small project-local logger implementation, removing the last remaining Node runtime warning on current versions.

## [0.5.0]

### Existing
- Upstream baseline imported before maintenance work on the fork began.

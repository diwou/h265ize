# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

Release policy for this fork:
- Only validated, working public releases receive semantic version numbers.
- Interim maintenance milestones are tracked by commit ID until they are proven fit for release.

## [Unreleased]

### Fixed
- Removed the unused `optional`, `long-stack-traces`, and `stack-trace` helper dependencies from the runtime install set. [7b5248a]
- Improved audio metadata fallbacks by recognizing uppercase Matroska title/language tags and estimating missing audio bitrates from the surrounding container when possible. [882a674]
- Replaced the remaining Moment.js time formatting and progress timing helpers with native date and duration helpers. [cdfda6b]
- Removed the `moment-duration-format` dependency from the live progress path by using a local duration formatter instead. [d1052cb]
- Changed the missing-input CLI path to print a clear error instead of showing help when no file or directory is provided. [fe7c749]
- Fixed crop detection aggregation so mixed samples no longer cancel out black bars at the top or bottom of the video. [f47c692]
- Fixed compatibility with current `mathjs` versions by using `math.evaluate()` instead of the removed `math.eval()`. [f47c692]
- Hardened crop aggregation so isolated over-aggressive samples no longer force already-cropped videos down to a much smaller height. [1ed1b6c]
- Made the progress display estimate output file size from the live encode progress instead of hiding it until the encode was far enough along. [f56c175]
- Fixed the progress percent fallback so `fluent-ffmpeg` values of `0` now use the timemark-based calculation instead of staying stuck at `0.0%`. [95116db]
- Marked progress file-size estimates as approximate with a leading `~` so they read as prognoses instead of exact values. [95116db]
- Made progress percentage prefer the timemark-based calculation and estimate output size from ffmpeg's live `size=` field when available. [00113f4]
- Added debug progress diagnostics for `--debug` runs so percent, timemark, size, speed, and ETA can be inspected directly. [b5db36e]
- Added a frame-based progress fallback for inputs where ffmpeg reports `timemark: N/A`, so stalled percent displays can still advance. [cc010cc]
- Added a stale-progress fallback that switches to frame-based progress when `timemark` stays unchanged while frames keep increasing. [0b5a315]

### Added
- Added bundled Matroska regression fixtures under `fixtures/matroska/` so probe and container tests can run against real validation samples. [902577e]
- Added a real crop preview smoke test that writes preview screenshots to a temp directory and verifies the generated files. [7d91128]
- Added a `--crop-preview` mode that saves crop preview screenshots and prints a short report before encoding starts. [108237c]
- Added a post-encode summary that reports bitrate, resolution, video codec, and track overview after successful completion. [e96064d]
- Added crop detection presets for `normal`, `analog`, and `strict` material via `--crop`. [a78d0c7]
- Added an `old` crop detection switch for older recordings that reuses the analog preset. [bc9b8d1]
- Added general-purpose `as-preset` helpers for `grain`, `fastdecode`, `zerolatency`, and `animation`. [b3fdf35]
- Added a `--dry-run` / `--show-command` option that prints the final ffmpeg command and stops before the encode stage runs. [1622907]
- Added startup validation for `settings.json` so unknown keys and invalid value types fail fast. [e2f02ab]
- Added a `--probe` mode that prints a compact source report and health check without starting the encode stage. [64cc005]
- Added a crop decision report that explains how the final crop value was chosen. [64cc005]
- Added a `--explain` mode that prints the chosen encoding plan and its main decision paths before the encode stage runs. [db96e98]
- Added a frame-progress display alongside the percent indicator so stalled progress can still show `current/estimated` frames. [8d21a24]
- Made the live ffmpeg progress line visually separate frames, progress, timemark, and ETA with labels and pipes. [0aacc3f]
- Tightened the frames label to `current/estimated frames` for easier scanning at a glance. [b9da3b5]
- Added an opt-in `--ignore-err` switch to tolerate lightly corrupted input files with `ffmpeg -err_detect ignore_err`. [9bd358b]

### Changed
- Trimmed a set of stale commented-out code blocks and dead helper paths while keeping the current runtime behavior intact. [41de0f9]
- Labeled the live ffmpeg progress timemark and ETA fields more explicitly so the progress line is easier to scan. [f4b45f3]
- Simplified the CLI startup flow by removing the promise wrapper and keeping the watcher local. [86f83ec]
- Kept `AGENTS.md` as a local-only maintenance note by ignoring it in git and removing it from version control. [882a674]
- Simplified the live ffmpeg progress line so the frame block is shown as `current/estimated frames` without a duplicated label. [2b793ca]
- Documented the fork-only feature set in the README so fork additions are easier to discover. [64cc005]
- Formatted the post-encode summary as separate logger lines so each line gets the standard `h265ize` prefix. [3d37841]
- Made the post-encode summary fall back to a container-based video bitrate estimate when stream bitrate metadata is missing or noisy. [26f793b]
- Changed the default x265 preset from `fast` to `medium` so quality is favored unless `fast` is selected explicitly. [68d2ea1]

## [0.6.3]

First validated public release of the maintained fork.

### Fixed
- Fixed `h265ize --version` for npm-installed builds by falling back to the package version when no Git checkout is available.
- Restored fast crop detection on long inputs by switching sampled scans back to input seeking and keeping fallback scans bounded to a short local window instead of effectively decoding the full file.

## Commit History Before First Validated Release

The following maintenance milestones were useful internal/public checkpoints, but they were withdrawn as releases because they contained blocking packaging or runtime issues. They remain listed here by commit ID for traceability.

### [0efcf69]

### Fixed
- Fixed global npm installation by shipping `patch-package` as a runtime dependency instead of a dev-only dependency.
- Pinned `fluent-ffmpeg` to the patched `2.1.2` release so fresh installs receive the exact version covered by the maintained compatibility patch.

### [ab4a1d0]

### Changed
- Updated npm package metadata to use the clearer maintained-fork description and a more relevant keyword set.
- Documented the real npm installation path in the README for the published package `@diwou/h265ize`.
- Cleaned up `package.json` test and `bin` entries so future npm publishes do not need automatic metadata correction.

### [5dfe2d9]

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

# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

Release policy for this fork:
- Only validated, working public releases receive semantic version numbers.
- Interim maintenance milestones are tracked by commit ID until they are proven fit for release.

## [Unreleased]

### Fixed
- Replaced `chokidar` with a local recursive `fs.watch` manager so the watch mode no longer depends on the old filesystem watcher package. [5af0663]
- Replaced `memorystream` with a built-in `PassThrough` stream so the preview output no longer depends on the old memory-stream helper package. [02087f9]
- Replaced `strip-ansi` with a local ANSI stripping helper so the logger, progress renderer, and tests no longer depend on the old ANSI cleanup package. [4fa2829]
- Fixed the native stage loop start index so encoding now begins with the first real stage instead of trying to read `name` from an undefined stage entry. [67f4e02]
- Guarded the native Promise stop path so video cleanup no longer tries to call Bluebird's `cancel()` on a resolved encode flow. [3f19344]
- Replaced `colors` with a local ANSI helper so the logging and progress formatting no longer depend on the old color wrapper package. [0b969a5]
- Replaced Bluebird with native Promises and a small local pause controller so the stage loop and screenshot sequencing no longer depend on the old promise helper stack. [4531fd0]
- Replaced `mime` with a small local extension-based video file detector so folder scanning no longer depends on the old MIME helper package. [0125c23]
- Replaced the old `keypress` package with Node's built-in keypress event handling for the TTY pause/debug controls. [ba1e3ed]
- Replaced `promise-pauser` with a local pause controller so encode pause/resume handling no longer depends on the old helper package. [5e583bd]
- Replaced the old `hasbin` and `filesize` dependencies with local helper routines so external command checks and file-size formatting no longer depend on stale packages. [7a6a1da]
- Simplified the extracted `node:test` helper module so it exports plain helper functions instead of mutating the native `assert` object. [0492992]
- Moved the small `node:test` assertion compatibility helpers into a local test helper module so `test.js` can focus on the actual test cases again. [348154e]
- Unified the live progress line segment construction so the wide renderer and the layout diagnostics share one common base instead of maintaining mirrored segment lists. [8612273]
- Replaced the Mocha/Chai test runner stack with Node's built-in `node:test` so the project can keep its test tooling dependency-free. [0c91b9b]
- Added an npm override so `serialize-javascript` resolves to the non-vulnerable `7.0.5` release and the test-only audit warnings disappear. [1f191fb]
- Removed stale TODO comments and the obsolete fallback-bitdepth comment block left behind from the old `fluent-ffmpeg` path. [85cef04]
- Removed the obsolete `patch-package` postinstall hook and deleted the stale `fluent-ffmpeg` compatibility patch after the direct ffmpeg migration made them unnecessary. [b562082]
- Restored `timemark` in the live progress renderer so the wide-terminal detail line can again show the same fields as the debug status and legacy output. [19cd9e8]
- Flattened the remaining progress diagnostic width fields so the debug output now shows each column value directly instead of a nested object. [5399328]
- Flattened the `--debug` progress width diagnostics so the live logs show the individual column sources instead of a nested `[object Object]` value. [95ec089]
- Used the same divider-style column source for the live progress output so wide terminals keep the familiar full-width progress line instead of falling back to the compact form. [263ce5a]
- Aligned the live progress width detection with the divider logic again so the wide-terminal progress line follows the same `process.stdout.columns` source as the separator row. [eb1909d]
- Removed the unsafe native TTY window-size calls so the live progress width detection can no longer abort the process with a Node assertion failure. [a2ef299]
- Used the internal TTY window-size handle as a last resort so the live progress output can still pick up the real terminal width when the public Node columns fields are unavailable. [8636ac5]
- Used the terminal `COLUMNS` environment value as an additional width source so the live progress output keeps the legacy wide-terminal layout in shells that do not expose the TTY width cleanly. [f1c0bab]
- Matched the wide-terminal progress bar width to the legacy output again so the familiar 22-character bar and full status line fit the 170-column layout. [4cad797]
- Restored the detailed live progress bar layout on wide terminals so the bar and the full status line appear again in the familiar order before the compact fallback takes over for narrow terminals. [d4d9606]
- Restored the verbose live progress line on wide terminals so the full bar and detailed status line are visible again, while keeping the compact fallback for narrow terminals. [5ce614b]
- Kept the verbose live progress line on wide terminals while still falling back to the compact progress bar layout when space is tight. [0308e86]
- Removed the inactive `gpu-info` runtime dependency and its unused hardware-detection probe from the encoder startup path. [edf6335]
- Showed `100%` instead of `100.0%` on the final progress line so the last frame count and completion state read cleanly. [d4f1355]
- Finalized the live progress line at completion so the last visible frame count is pulled to the exact total and `100%` before the summary starts. [e2e4adc]
- Reordered the live progress line so narrow terminals keep `fps` visible before lower-priority details and use a shorter bar when space is tight. [d3d7b67]
- Prioritized the live progress fields by terminal width so narrow terminals keep the bar, percent, and ETA while dropping lower-priority details first. [2c7beb7]
- Added an adaptive ASCII progress bar to the live encode output so the status line scales with terminal width. [8cd6630]
- Removed `fluent-ffmpeg` from the runtime path by switching the remaining command-building logic to a local ffmpeg builder. [5fdfdc8]
- Normalized the direct ffmpeg progress fields so live encode updates again expose `fps`, `frames`, `timemark`, and size data in the expected legacy shape. [1b329fc]
- Fixed live ffmpeg progress parsing so carriage-return-delimited updates are emitted during encoding instead of waiting until the end of the process. [ebc4045]
- Spawned the main encode and sample commands directly so the remaining `fluent-ffmpeg` processing path can be migrated step by step. [c8965bf]
- Replaced the read-only `ffmpeg` analysis paths for crop detection, deinterlace detection, and audio normalization with direct spawn helpers so the next `fluent-ffmpeg` removal step can be tested independently. [436ed1e]
- Switched the metadata probe path to a direct `ffprobe` spawn helper so the first phase of the `fluent-ffmpeg` removal can be tested independently. [a7900ef]
- Added frame-rate source diagnostics to `--debug` progress output so it is visible whether `avg_frame_rate` or `r_frame_rate` was used. [92034f5]
- Added a frame-rate fallback from `r_frame_rate` and an ETA fallback from the remaining duration when `avg_frame_rate` is missing or unusable. [80f7ce5]
- Switched bitrate grouping to comma separators so summary values read as `5,019 kb/s` instead of space-separated groups. [1492efc]

## [0.6.4] - 2026-04-14

### Fixed
- Changed the CLI version output to print the released package version instead of a branch hash on the release branches. [ffbd0a7]
- Replaced deprecated `fs.F_OK` checks with `fs.constants.F_OK` so startup no longer emits Node deprecation warnings. [2cc1af2]
- Replaced the remaining `fs-extra`, `recursive-readdir`, and `lodash` runtime dependencies with local Node-based helpers. [03e618d]
- Removed the unused `optional`, `long-stack-traces`, and `stack-trace` helper dependencies from the runtime install set. [7b5248a]
- Improved audio metadata fallbacks by recognizing uppercase Matroska title/language tags and estimating missing audio bitrates from the surrounding container when possible. [882a674]
- Removed the `mathjs` runtime dependency by replacing frame-rate parsing with a local helper. [2444b5d]
- Replaced the remaining Moment.js time formatting and progress timing helpers with native date and duration helpers. [cdfda6b]
- Removed the `moment-duration-format` dependency from the live progress path by using a local duration formatter instead. [d1052cb]
- Changed the missing-input CLI path to print a clear error instead of showing help when no file or directory is provided. [fe7c749]
- Fixed crop detection aggregation so mixed samples no longer cancel out black bars at the top or bottom of the video. [f47c692]
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

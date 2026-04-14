# TODO

Read first:
- Start with `Must Do`.
- Treat `Should Do` as the normal maintenance queue.
- Keep `Could Do` for opportunistic cleanups only.
- Leave `fluent-ffmpeg` for the very end.

## Must Do

- No current open items.

## Should Do

- No current open items.

## Could Do

- Reviewed larger utility dependencies like `fs-extra`, `recursive-readdir`, `lodash`, and `mathjs`; no safe removal without a concrete refactor reason.

## Last Resort

- Replace `fluent-ffmpeg` with a direct internal `ffmpeg` / `ffprobe` wrapper once the smaller maintenance work is finished and the codebase is otherwise stable.

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

- Revisit larger utility dependencies like `fs-extra`, `recursive-readdir`, `lodash`, and `mathjs` only when there is a concrete refactor reason.
- Continue trimming old comments and dead code paths as they surface during normal work.

## Last Resort

- Replace `fluent-ffmpeg` with a direct internal `ffmpeg` / `ffprobe` wrapper once the smaller maintenance work is finished and the codebase is otherwise stable.

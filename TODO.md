# TODO

Read first:
- Start with `Must Do`.
- Treat `Should Do` as the normal maintenance queue.
- Keep `Could Do` for opportunistic cleanups only.
- Leave `fluent-ffmpeg` for the very end.

## Must Do

- No current open items.

## Should Do

- Review smaller legacy helper dependencies and remove the ones that are no longer pulling their weight.
- Consider simplifying the command-line wrapper and startup flow where it reduces maintenance cost without changing behavior.
- Keep the repository and lockfile metadata tidy so future maintenance remains predictable.

## Could Do

- Polish the live progress output only if there is a clear readability win.
- Revisit larger utility dependencies like `fs-extra`, `recursive-readdir`, `lodash`, and `mathjs` only when there is a concrete refactor reason.
- Continue trimming old comments and dead code paths as they surface during normal work.

## Last Resort

- Replace `fluent-ffmpeg` with a direct internal `ffmpeg` / `ffprobe` wrapper once the smaller maintenance work is finished and the codebase is otherwise stable.

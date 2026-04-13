# Matroska Fixtures

This directory contains a small curated copy of the upstream Matroska test
files from:

- https://github.com/ietf-wg-cellar/matroska-test-files

The files are bundled so the test suite can exercise real-world Matroska edge
cases without depending on an external download during development.

The current set covers:

- a basic audio/video sample
- an audio bitrate example
- a source with missing duration metadata
- a multi-track source with multiple subtitle streams and commentary audio
- additional small Matroska validation samples for regression checks

Each `.mkv` file has a matching `*-tag.xml` sidecar from the upstream test
set.

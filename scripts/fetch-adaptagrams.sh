#!/usr/bin/env bash
# Fetches a pinned commit of the Adaptagrams source (LGPL-2.1-or-later,
# Copyright Monash University / Tim Dwyer, Michael Wybrow, Steve Kieffer)
# and stages just the libavoid sources this package needs.
#
# We pin an exact commit (rather than tracking a branch) so wasm builds are
# reproducible. Bump ADAPTAGRAMS_REF deliberately when you want to pick up
# upstream libavoid changes, and re-check src/bindings.cpp against the new
# headers before doing so.
set -euo pipefail

ADAPTAGRAMS_REPO="https://github.com/mjwybrow/adaptagrams.git"
# TODO: pin to a specific commit SHA once you've verified bindings.cpp
# against that revision's headers. HEAD is a placeholder for local dev.
ADAPTAGRAMS_REF="${ADAPTAGRAMS_REF:-master}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/third_party/adaptagrams"

if [ -d "${VENDOR_DIR}/.git" ]; then
  echo "adaptagrams already present at ${VENDOR_DIR}, fetching ref ${ADAPTAGRAMS_REF}..."
  git -C "${VENDOR_DIR}" fetch --depth 1 origin "${ADAPTAGRAMS_REF}"
  git -C "${VENDOR_DIR}" checkout FETCH_HEAD
else
  echo "cloning adaptagrams (${ADAPTAGRAMS_REF}) into ${VENDOR_DIR}..."
  rm -rf "${VENDOR_DIR}"
  mkdir -p "$(dirname "${VENDOR_DIR}")"
  git clone --depth 1 --branch "${ADAPTAGRAMS_REF}" "${ADAPTAGRAMS_REPO}" "${VENDOR_DIR}" \
    || {
      # ADAPTAGRAMS_REF may be a commit SHA rather than a branch/tag name.
      git clone "${ADAPTAGRAMS_REPO}" "${VENDOR_DIR}"
      git -C "${VENDOR_DIR}" checkout "${ADAPTAGRAMS_REF}"
    }
fi

echo "adaptagrams source ready at ${VENDOR_DIR}"
echo "libavoid sources: ${VENDOR_DIR}/cola/libavoid"

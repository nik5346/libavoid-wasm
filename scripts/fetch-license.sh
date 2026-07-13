#!/usr/bin/env bash
# Downloads the canonical, verbatim LGPL-2.1 license text from the FSF and
# saves it as LICENSE.LGPL. The FSF explicitly permits verbatim copying and
# distribution of the license document itself ("Everyone is permitted to
# copy and distribute verbatim copies of this license document, but
# changing it is not allowed"), which is why this is fetched fresh rather
# than hand-transcribed.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
curl -fsSL "https://www.gnu.org/licenses/lgpl-2.1.txt" -o "${ROOT_DIR}/LICENSE.LGPL"
echo "Wrote ${ROOT_DIR}/LICENSE.LGPL"

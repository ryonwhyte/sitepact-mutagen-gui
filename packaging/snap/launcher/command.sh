#!/bin/bash -e
# Guarantee the ssh shim wins over the bundled ssh regardless of what the gnome extension's
# command-chain set for PATH (it runs before this launcher).
export PATH="$SNAP/ssh-shim:$PATH"
# Force X11/XWayland (Electron 38 native Wayland is unreliable); snap provides confinement.
exec "$SNAP/mutagen-sync-manager" --ozone-platform=x11 --no-sandbox "$@"

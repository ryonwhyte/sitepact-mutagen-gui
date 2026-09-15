# Building Mutagen Sync Manager

## Important: build the Python backend against an OLD glibc

The snap is built on the `core20` base (glibc 2.31). The backend is a PyInstaller
binary that bundles system libraries (libgcc_s, libstdc++, ...) from wherever it is
built. If you build the backend on a modern distro (e.g. Ubuntu 24.04+ / 26.04, which
ships glibc 2.35+), those bundled libraries require a newer glibc than core20 provides,
and the snap's backend crashes at startup with:

    ImportError: /usr/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.35' not found
                 (required by .../libgcc_s.so.1)

The app then shows "Failed to fetch" (no backend) or a read-only-database error if a
stray backend is answering on port 8000.

### Fix: build the backend in a Debian bullseye container (glibc 2.31, matches core20)

```
cd backend
podman run --rm -v "$PWD":/be:Z -w /be python:3.12-bullseye \
  bash -c "pip install -r requirements.txt pyinstaller && pyinstaller backend-server.spec --noconfirm"
```

(`docker` works too. If podman complains about a storage-config mismatch after a
`$HOME` change, run it with a fresh store: add
`--root /tmp/pod-root --runroot $XDG_RUNTIME_DIR/pod-run`.)

This produces `backend/dist/backend-server` that runs under glibc 2.31. Verify with:

```
podman run --rm -v "$PWD/dist":/d:Z ubuntu:20.04 /d/backend-server   # should start, no GLIBC error
```

Then build the app:

```
cd ../frontend
npm run dist:linux      # -> releases/*.snap, *.deb, *.AppImage
```

The `.deb` and `.AppImage` run on the host glibc, so they can use a backend built
natively; only the **snap** needs the old-glibc backend.

## Notes baked into the config

- `frontend/package.json` -> `build.snap.executableArgs: ["--ozone-platform=x11"]`:
  forces X11/XWayland. Electron 38 removed `ELECTRON_OZONE_PLATFORM_HINT`, and native
  Wayland crashes under snap; this must be a real launch argument (appendSwitch and the
  env var do not work under snap).
- `backend/main.py` stores its SQLite DB under `MSM_DATA_DIR` (passed by Electron as
  `app.getPath('userData')`), NOT the working directory, which is unwritable/unstable
  under snap confinement.

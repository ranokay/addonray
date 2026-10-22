# Keep test authority separate from product consent

Chrome's native optional-extension permission prompt has no verified public DevTools control for automated approval. We use a separately named fixture with pre-granted permissions for hosted API/interface checks, preserve the unmodified product artifact, and observe actual denial/approval separately in a native disposable macOS session. This avoids fragile protected-profile preference edits and prevents a green fixture run from being mistaken for evidence that product consent or retail installation works.

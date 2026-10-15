# Contributing

Issues and pull requests are welcome. Keep changes focused and avoid adding unnecessary permissions, third-party trackers, or background CPU/memory polling.

1. State which Edge/Chrome, Tampermonkey, and script version you tested.
2. For parser changes, include a **redacted/synthetic** sample; never paste a real access token, cookie, or private conversation.
3. Run the dependency-free Node checks described in README.md.
4. Preserve accurate unknown states: do not invent a missing 5-hour or 7-day quota.
5. Do not weaken the extension's host matching, permission scope, or read-only endpoint policy without a clearly documented security rationale.

The maintainer may request changes before accepting a contribution. Contributions should be compatible with the project's MIT license.

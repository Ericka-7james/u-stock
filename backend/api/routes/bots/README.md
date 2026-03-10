# Bots Routes

This package contains the modularized replacement for the former monolithic
`backend/api/routes/bots.py`.

## Structure

- `__init__.py`
  - Composes the package router
  - Applies the public `/api/bots` prefix
- `cookie_routes.py`
  - UI-facing cookie-auth endpoints
  - list, status, arm, disarm, start, stop, log, intents, events
- `config_routes.py`
  - bot config read/write endpoints
- `runner_routes.py`
  - runner-auth endpoints
  - heartbeat, runner status, submit intents
- `deps.py`
  - shared dependency helpers
  - service construction, uid resolution
- `utils.py`
  - shared parsing/validation helpers

## Design Notes

- Child route modules do not define their own shared prefix.
- The package router owns the public `/api/bots` prefix.
- `deps.py` and `utils.py` are support modules, not routers.
- Root endpoints inside child routers should use `/`, not an empty string,
  to avoid FastAPI empty-prefix routing errors during composition.
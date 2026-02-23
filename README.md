# Treasure Hunt (Server Validated)

This version keeps code validation on the server so participants cannot read the next hints or expected codes from browser JavaScript.

## Run

```bash
cd "tesrue hunt"
TREASURE_PEPPER='change-this-to-a-secret' node server.js
```

Open `http://127.0.0.1:8080`.

## Security notes

- Keep `TREASURE_PEPPER` secret and different from this sample value.
- Host only the frontend assets and API; do not expose server source to participants.
- For production, put this behind HTTPS and add stronger IP-based rate limiting / logging.

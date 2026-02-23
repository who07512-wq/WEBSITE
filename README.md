# Treasure Hunt (Vercel)

This project is ready for Vercel with static frontend + serverless API routes.

## Local

```bash
cd "tesrue hunt"
vercel dev
```

## Deploy to Vercel

```bash
cd "tesrue hunt"
vercel
vercel --prod
```

Set environment variable in Vercel project settings:

- `TREASURE_PEPPER`: a long random secret (must be private)

## Security model

- Browser never contains the correct code values.
- Validation is done in `/api/submit`.
- Session progress is in a signed token (`sessionToken`) so users cannot tamper stage.
- Basic brute-force limiting is applied per signed session token.

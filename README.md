# Curiosity

## A notebook for the curious

We don't think linearly, why investigate so?

## Setup

1. Copy `.env.local.example` to `.env.local`
2. Generate a secure encryption key and add it to `.env.local`:
   ```bash
   openssl rand -hex 32
   ```
3. Install dependencies and run:
   ```bash
   npm install
   npm run dev
   ```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CURIOSITY_ENCRYPTION_KEY` | Yes | Encryption key for secure storage of API keys and OAuth tokens. Generate with `openssl rand -hex 32` |

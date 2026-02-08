# Architectural Decisions - Upload Limit 100MB

## Key Decisions

- Hardcode 100MB (no environment variable) - per user preference
- Buffer-based upload stays (streaming only needed at 500MB+)
- Worker concurrency stays at 2 (safe with Docker memory limits)
- Docker limits: web=2GB, worker=2GB, redis=512MB

(Tasks will append findings here)

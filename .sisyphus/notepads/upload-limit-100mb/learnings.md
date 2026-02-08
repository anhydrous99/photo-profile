# Learnings - Upload Limit 100MB

## Conventions & Patterns

(Tasks will append findings here)

## Docker Memory Limits (Wave 1)

**Task**: Add memory limits to docker-compose.yml for safe 100MB upload handling.

**Implementation**:

- Added `mem_limit: 2g` to web service (line 19)
- Added `mem_limit: 2g` to worker service (line 37)
- Added `mem_limit: 512m` to redis service (line 51)

**Rationale**:

- Web service: 2GB provides 6× headroom for ~300MB peak during 100MB upload
- Worker service: 2GB provides 5× headroom for Sharp image processing (2 concurrent jobs @ ~400MB peak)
- Redis service: 512MB is generous for job queue metadata only

**Verification**:

- `grep -n "mem_limit" docker-compose.yml` returns 3 matches with correct values
- `docker compose config --quiet` validates YAML syntax successfully
- Commit: c871c38 (chore(docker): add memory limits for upload safety)

**Key Learning**: YAML indentation in docker-compose.yml must be consistent (2 spaces per level). Using Edit tool requires careful context matching to preserve indentation.

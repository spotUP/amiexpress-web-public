# Server Restart Rules

**NEVER restart servers yourself.** Always ask the user to do it.

## Why
- Background bash processes leave zombie tasks behind
- These zombies consume tokens in every message (100-200 tokens each)
- They persist even after session summarization
- Only a full session restart clears zombie references

## Correct Workflow
1. Make code changes
2. Tell user: "Please restart the servers to test the changes"
3. Wait for user to confirm servers are up
4. Then proceed with testing/debugging

## Commands to NEVER run
- `./dev/scripts/start-servers.sh`
- `./dev/scripts/kill-servers.sh`
- Any background process with `&` or `run_in_background: true`

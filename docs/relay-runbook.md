# Relay Runbook

Use this runbook when WebSocket consumers miss feed packets, `artifact-smoke` reports a timeout, or you need to replay specific server events into `events_channel`.

## Quick recovery steps
1. **Ensure the relay is running and connected.** Check `docker logs jls_relay` (or your orchestration logs) for `ws relay online` followed by recent `websocket client connected` messages. Confirm clients can reach `ws://relay:3010` (or the external load balancer IP).
2. **Confirm the backend has published the target event.** Query Postgres directly:
   ```sh
   COMPOSE_PROJECT_NAME=jls ADMIN_TOKEN=… docker compose exec -T db psql -U postgres -d jls -At -c \
   "SELECT id, type FROM events ORDER BY created_at DESC LIMIT 5;"
   ```
3. **Replay the event once clients are connected.** Run the helper script *after* the clients (smoke test, HUD, etc.) are connected so the broadcast is seen:
   ```sh
   ADMIN_TOKEN=… BASE_URL=http://localhost:3000 WS_URL=ws://relay:3010 node scripts/replay-event.js 1775...
   ```
   You can also publish a saved payload directly:
   ```sh
   node scripts/replay-event.js --file /tmp/artifact_event.json
   ```
4. **Validate the relay emitted both the raw event and the feed.** Watch `docker logs jls_relay --tail 50` for `artifact_spawn` and `feed` messages, or use `ws://localhost:3010` with a simple WebSocket client to observe the packets.
5. **Retry `npm run artifact-smoke`.** Once you replay the event, rerun smoke test to ensure automation still passes before you continue with the deploy workflow.

## Tips
- Store the helper output/event file alongside the incident record so you can rerun it later (`jq`-dumped JSON works fine).  
- Combine the runbook with your `npm run artifact-smoke` automation to gate deploys—if smoke fails, use this helper before re-running the CI job so you know the relay pipeline is still healthy.  

---
name: elevenlabs-voice-selection
description: ElevenLabs Agents voice-override protocol constraints that constrain any voice-architecture decision in this app
metadata:
  type: reference
---

ElevenLabs Agents integration facts (verified 2026-07-24 against ElevenLabs docs, not derivable from our code) that constrain any future voice-routing/security design here:

- **Runtime TTS voice is selected by CLIENT-initiated override only** (`conversation_initiation_client_data` → `overrides.tts.voiceId`). Our client does this at `src/lib/realtime/RealtimeVoiceSession.tsx` (`tts.voiceId`). The signed WebSocket URL alone does NOT encode voice selection.
- **No server-side voice-pin path.** `GET /v1/convai/conversation/get-signed-url` accepts only `agent_id`, `include_conversation_id`, `branch_id`, `environment` — no voice/override params. So you cannot bake the voice into the signed URL/token server-side without per-challenge dedicated agents (heavy: agents are per-scenario, prompt authored on the dashboard per ADR-0004).
- **IVC (instant voice clone) voice_ids are account-scoped and non-shareable** — usable only with the owning ElevenLabs account's API key (our app's key). A raw voiceId string leaked to a client is an opaque reference that cannot be reused in a third party's own ElevenLabs account.

**How to apply:** This is why raw voiceId reaching the challenge taker's browser is unavoidable on the live path, and why ADR-0006 A2 chose a scoped exception over a server-side relay/per-challenge-agent rework. If ElevenLabs later ships opaque scoped voice handles or a server-side override, revisit [[the §14.2 extraction-block invariant]] to close the normal-session self-exposure gap noted as out-of-scope in ADR-0006 A2.

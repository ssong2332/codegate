import { test } from "node:test";
import assert from "node:assert/strict";
import { MockVoiceProvider, MOCK_ARTIFACT_ID_PREFIX, MOCK_VOICE_ID_PREFIX } from "../mockProvider";

test("MockVoiceProvider.createClone flags isMock:true and mock- prefixed voiceId (identifiability)", async () => {
  const provider = new MockVoiceProvider();
  const result = await provider.createClone({ sessionId: "s1", uid: "u1" });

  assert.equal(result.isMock, true, "isMock must be true so callers never mistake this for a real ElevenLabs clone");
  assert.equal(result.cloneStatus, "ready");
  assert.match(result.voiceId, new RegExp(`^${MOCK_VOICE_ID_PREFIX}`));
});

test("MockVoiceProvider.createClone returns a distinct voiceId per call", async () => {
  const provider = new MockVoiceProvider();
  const a = await provider.createClone({ sessionId: "s1", uid: "u1" });
  const b = await provider.createClone({ sessionId: "s1", uid: "u1" });

  assert.notEqual(a.voiceId, b.voiceId);
});

test("MockVoiceProvider.synthesize flags isMock:true, synthetic:true, and returns a playable audio data URI", async () => {
  const provider = new MockVoiceProvider();
  const result = await provider.synthesize({
    sessionId: "s1",
    voiceId: "mock-voice-x",
    text: "임의 문장",
  });

  assert.equal(result.isMock, true, "isMock must be true so callers never mistake this for real ElevenLabs TTS");
  assert.equal(result.synthetic, true);
  assert.equal(result.syntheticLabel, "AI 훈련용 합성");
  assert.match(result.audioUrl, /^data:audio\/wav;base64,/);
});

test("MockVoiceProvider.deleteVoice resolves without throwing (no external state to purge)", async () => {
  const provider = new MockVoiceProvider();
  await assert.doesNotReject(provider.deleteVoice("mock-voice-x"));
});

test("MOCK_ARTIFACT_ID_PREFIX/MOCK_VOICE_ID_PREFIX carry an explicit mock- marker", () => {
  assert.equal(MOCK_VOICE_ID_PREFIX, "mock-voice-");
  assert.equal(MOCK_ARTIFACT_ID_PREFIX, "mock-artifact-");
});

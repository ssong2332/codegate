import { test } from "node:test";
import assert from "node:assert/strict";
import { getVoiceProvider } from "../provider";

test("getVoiceProvider() currently selects MockVoiceProvider (ElevenLabs key not yet wired, OQ-14)", () => {
  const provider = getVoiceProvider();
  assert.equal(provider.providerName, "mock");
});

test("getVoiceProvider() result satisfies the VoiceProvider contract end-to-end", async () => {
  const provider = getVoiceProvider();

  const clone = await provider.createClone({ sessionId: "s1", uid: "u1" });
  assert.equal(clone.isMock, true);

  const synth = await provider.synthesize({
    sessionId: "s1",
    voiceId: clone.voiceId,
    text: "엄마 나 사고났어",
  });
  assert.equal(synth.isMock, true);
  assert.equal(synth.synthetic, true);

  await provider.deleteVoice(clone.voiceId);
});

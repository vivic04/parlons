// Shared by the app and the audio generator: which recorded clip belongs to which text.
window.audioKey = t => { const s = String(t).replace(/\s+/g, " ").trim(); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return s.length.toString(36) + h.toString(36); };
// Fill a quiz blank with the correct answer to get the full sentence ("Je ___ aime ___" + "n' / pas" → "Je n'aime pas").
window.fillBlank = (q, opt) => { const n = (String(q).match(/___/g) || []).length, parts = String(opt).split(/\s*\/\s*/); let i = 0;
  const out = String(q).replace(/___/g, () => (n > 1 && parts.length === n) ? parts[i++] : (i++ === 0 ? opt : ""));
  return out.replace(/\s*\([^)]*\)/g, "").replace(/\s+([.,!?;:])/g, "$1").replace(/(\b[\p{L}]+')\s+/gu, "$1").replace(/\s{2,}/g, " ").trim(); };

/**
 * voiceDestinationExtractor.ts
 *
 * Strips Hindi, Hinglish, and English carrier intent phrases from raw speech
 * recognition output so that only the clean location / destination name
 * remains before it is passed to the Places search API.
 *
 * Examples:
 *   "Mujhe Darbhanga Railway Station jaana hai" → "Darbhanga Railway Station"
 *   "Take me to Delhi Airport"                  → "Delhi Airport"
 *   "Bhaiya Patna AIIMS le chalo"               → "Patna AIIMS"
 *   "मुझे इंडिया गेट जाना है"                   → "इंडिया गेट"
 *   "India Gate"                                → "India Gate"  (unchanged)
 */

/** Clean punctuation that STT engines sometimes append */
function stripPunctuation(text: string): string {
  return text.replace(/[।,.!?]/g, '').replace(/\s+/g, ' ').trim();
}

/** Remove leading English carrier phrases */
function stripEnglishPrefixes(text: string): string {
  return text.replace(
    /^(please\s+)?(take\s+me\s+to|drop\s+me\s+at|go\s+to|drive\s+to|navigate\s+to|book\s+a\s+ride\s+to|i\s+want\s+to\s+go\s+to|i\s+need\s+to\s+go\s+to|bring\s+me\s+to|drop\s+at|head\s+to)\s+/i,
    ''
  );
}

/** Remove trailing English carrier phrases */
function stripEnglishSuffixes(text: string): string {
  return text.replace(
    /\s+(please|now|asap|by\s+bike|by\s+auto|by\s+car|by\s+cab|using\s+bike|using\s+car)$/i,
    ''
  );
}

/** Remove leading Hindi / Hinglish carrier words */
function stripHindiPrefixes(text: string): string {
  return text.replace(
    /^(mujhe|hume|hamein|humko|bhaiya|bhai|driver\s+ji|yaar|gaadi|boss|sir|didi|madam)\s+(bhi\s+)?(bhi\s+)?/i,
    ''
  );
}

/** Remove trailing Hindi / Hinglish carrier phrases */
function stripHindiSuffixes(text: string): string {
  return text.replace(
    /\s+(jaana\s+hai|jana\s+hai|le\s+chalo|le\s+ja|chalna\s+hai|pahuncha\s+do|pahuncha\s+dena|drop\s+kardo|drop\s+kar\s+do|chodo|chod\s+do|jaana|jana|jaao|jao|le\s+chal|pohochna\s+hai|pohonchna\s+hai)$/i,
    ''
  );
}

/** Remove Devanagari script prefixes */
function stripDevanagariPrefixes(text: string): string {
  return text.replace(/^(मुझे|हमें|कृपया|भाई|भैया|यार|गाड़ी|बॉस)\s+/, '');
}

/** Remove Devanagari script suffixes */
function stripDevanagariSuffixes(text: string): string {
  return text.replace(
    /\s+(जाना\s+है|ले\s+चलो|चलना\s+है|पहुँचा\s+दो|पहुंचा\s+दो|छोड़\s+दो|ड्रॉप\s+करो|ड्राइव\s+करो)$/,
    ''
  );
}

/**
 * Main export: pass raw STT transcript → get clean location query.
 * Falls back to the original text if nothing useful can be extracted.
 */
export function extractDestinationQuery(rawText: string): string {
  if (!rawText || !rawText.trim()) return '';

  let text = stripPunctuation(rawText);

  // Strip payment & vehicle terms first
  text = text.replace(/(?:by|se|me|में|से)?\s*(?:online|upi|cash|कार्ड|card|पेमेंट|payment)\s*(?:se|payment|mode)?/gi, ' ');
  text = text.replace(/(?:by|se|से)?\s*(?:car|कार|bike|बाइक|auto|ऑटो|suv|एसयूवी|cab|cabs)\s*(?:chahiye|ride|booking|चाहिए)?/gi, ' ');
  text = text.replace(/\b(?:by|se|me|in)\b/gi, ' ');
  text = text.replace(/(?:chahiye|चाहिए)/gi, ' ');

  // Apply prefix and suffix layers
  text = stripEnglishPrefixes(text);
  text = stripHindiPrefixes(text);
  text = stripDevanagariPrefixes(text);
  text = stripHindiSuffixes(text);
  text = stripEnglishSuffixes(text);
  text = stripDevanagariSuffixes(text);

  text = text.replace(/\s+/g, ' ').trim();

  // If stripping removed everything, return original
  return text.length >= 2 ? text : rawText.trim();
}

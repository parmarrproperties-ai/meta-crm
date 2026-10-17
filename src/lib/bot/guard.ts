/**
 * Protection around the AI. Layers, in order:
 *  1. Buttons first: taps never reach the AI.
 *  2. preScreen(): obvious off-topic or manipulation attempts (code requests,
 *     "ignore your instructions", very long messages …) are refused with a
 *     fixed reply before any AI call.
 *  3. The AI only classifies the message and may write a short answer; its
 *     choices are checked against the allowed values (see engine.ts).
 *  4. checkReply(): the AI's answer is rejected if it looks like code, leaks
 *     instructions, contains links, or quotes numbers that are not in the
 *     knowledge base. A rejected answer is replaced by a fixed hand-off reply.
 */

export const MAX_INPUT_CHARS = 500;

/** Clean the lead's text before it goes anywhere near a prompt. */
export function sanitizeInput(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁯]/g, "")
    .replace(/<<<|>>>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INPUT_CHARS);
}

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instruction|instructions|rules|prompt|above|previous|prior|system)\b/i,
  /\b(system|developer|hidden|initial)\s+(prompt|message|instruction)/i,
  /\byou are (now|no longer)\b/i,
  /\b(act|behave|pretend|roleplay|role-play)\s+(as|like)\b/i,
  /\b(jailbreak|dan mode|developer mode|do anything now)\b/i,
  /\breveal\b.{0,30}\b(prompt|instruction|rules|config)/i,
  /\bnew (instructions|rules|role)\b/i,
  /\[\/?(inst|system)\]|<\|?(system|im_start|im_end)\|?>/i,
];

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /```|<\/?script|#include\s*<|\bprintf\s*\(|\bconsole\.log\b|\bpublic\s+static\b|\bdef\s+\w+\s*\(|\bSELECT\b.+\bFROM\b/i,
  /\b(write|generate|give|show|create|make|explain|solve|debug|fix)\b.{0,40}\b(code|program|script|function|algorithm|essay|poem|story|song|joke|homework|assignment|sql|query|regex)\b/i,
  /\b(linked list|binary tree|data structure|python|java(script)?|c\+\+|html|css|leetcode|react|node\.?js)\b/i,
  /\b(translate|summari[sz]e)\b.{0,30}\b(this|text|paragraph|article)\b/i,
  /\b(chatgpt|gemini|openai|claude|llm|language model)\b/i,
];

export type PreScreen = "ok" | "off_topic";

export function preScreen(text: string): PreScreen {
  if (text.length >= MAX_INPUT_CHARS) return "off_topic"; // essays aren't property replies
  if (INJECTION_PATTERNS.some((p) => p.test(text))) return "off_topic";
  if (OFF_TOPIC_PATTERNS.some((p) => p.test(text))) return "off_topic";
  return "ok";
}

const BAD_OUTPUT: RegExp[] = [
  /```|<\/?[a-z]+[^>]*>|\{[^}]*;[^}]*\}|;\s*$|=>|\bfunction\b|\breturn\b\s*[\w(]|#include|\bdef\s+\w+\(|\bclass\s+\w+/im,
  /\b(system prompt|my instructions|as an ai|language model|i am an ai|i'm an ai|gemini|openai|chatgpt)\b/i,
  /https?:\/\/|www\.|\b[\w.-]+\.(com|in|net|org|io)\b/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
];

/**
 * Validate an AI-written answer. Every number in it must appear in the facts
 * (so prices, sizes and dates can't be made up).
 */
export function checkReply(reply: string, facts: string): string | null {
  const r = reply.replace(/\s+/g, " ").trim();
  if (!r || r.length > 600) return null;
  if (BAD_OUTPUT.some((p) => p.test(r))) return null;
  const factDigits = facts.replace(/,/g, "");
  for (const n of r.replace(/,/g, "").match(/\d+(\.\d+)?/g) ?? []) {
    if (!factDigits.includes(n)) return null;
  }
  return r;
}

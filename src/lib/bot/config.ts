/**
 * Everything you are likely to want to change about the WhatsApp bot lives in
 * this file: the questions and their buttons, how a lead is scored, the
 * follow-up schedule and the fixed replies.
 *
 * WhatsApp limits (the API rejects messages that break them):
 *  - Reply buttons: max 3 per message, title max 20 characters.
 *  - List rows: max 10, title max 24 characters, description max 72.
 */

export const BUSINESS_NAME = process.env.BUSINESS_NAME || "Parmar Properties";

export interface QuestionOption {
  id: string;
  title: string;
  description?: string;
  /** Typed words that count as picking this option (lower case). */
  synonyms?: string[];
}

export interface Question {
  id: string;
  /** Column header in the Google Sheet. */
  label: string;
  prompt: string;
  kind: "buttons" | "list";
  /** Text on the button that opens a list (max 20 chars). */
  listButton?: string;
  options: QuestionOption[];
  /** Only ask when this returns true for the answers so far. */
  when?: (answers: Answers) => boolean;
}

export type Answers = Record<string, string | boolean | undefined> & {
  /** Lead skipped the questions with "Call me" / "Site visit" from a template. */
  shortcut?: boolean;
};

export const QUESTIONS: Question[] = [
  {
    id: "config",
    label: "Configuration",
    prompt: "Which configuration are you looking for?",
    kind: "list",
    listButton: "Choose option",
    options: [
      { id: "1bhk", title: "1 BHK", synonyms: ["1bhk", "1 bhk", "one bhk", "1 bed"] },
      { id: "2bhk", title: "2 BHK", synonyms: ["2bhk", "2 bhk", "two bhk", "2 bed"] },
      { id: "3bhk", title: "3 BHK", synonyms: ["3bhk", "3 bhk", "three bhk", "3 bed"] },
      { id: "4bhk", title: "4 BHK", synonyms: ["4bhk", "4 bhk", "four bhk", "4 bed"] },
      { id: "5bhk", title: "5 BHK+ / Penthouse", synonyms: ["5bhk", "5 bhk", "penthouse", "duplex"] },
      { id: "undecided", title: "Not decided yet", synonyms: ["not decided", "not sure", "undecided", "any"] },
    ],
  },
  {
    id: "budget",
    label: "Budget",
    prompt: "What budget range are you considering?",
    kind: "list",
    listButton: "Choose budget",
    options: [
      { id: "lt2", title: "Under ₹2 Cr" },
      { id: "2to5", title: "₹2 – 5 Cr" },
      { id: "5to10", title: "₹5 – 10 Cr" },
      { id: "10to20", title: "₹10 – 20 Cr" },
      { id: "gt20", title: "Above ₹20 Cr" },
      { id: "na", title: "Prefer not to say", synonyms: ["prefer not to say", "not now", "later"] },
    ],
  },
  {
    id: "purpose",
    label: "Purpose",
    prompt: "Is this for your own use or as an investment?",
    kind: "buttons",
    options: [
      { id: "own", title: "Own use", synonyms: ["own use", "self use", "self", "to live", "end use", "personal"] },
      { id: "invest", title: "Investment", synonyms: ["investment", "invest", "rental", "returns"] },
      { id: "both", title: "Both", synonyms: ["both"] },
    ],
  },
  {
    id: "timeline",
    label: "Timeline",
    prompt: "When are you planning to buy?",
    kind: "list",
    listButton: "Choose timeline",
    options: [
      { id: "now", title: "Immediately", synonyms: ["immediately", "asap", "right now", "urgent"] },
      { id: "3m", title: "Within 3 months", synonyms: ["within 3 months", "3 months", "1 month", "2 months"] },
      { id: "6m", title: "3 – 6 months", synonyms: ["3-6 months", "6 months", "4 months", "5 months"] },
      { id: "later", title: "After 6 months", synonyms: ["after 6 months", "next year", "1 year"] },
      { id: "exploring", title: "Just exploring", synonyms: ["just exploring", "exploring", "just looking", "browsing"] },
    ],
  },
  {
    id: "next_step",
    label: "Next step",
    prompt: "How would you like to proceed?",
    kind: "buttons",
    options: [
      { id: "visit", title: "Book site visit", synonyms: ["site visit", "visit", "see the property", "book visit"] },
      { id: "call", title: "Call me", synonyms: ["call me", "call", "phone me", "talk"] },
      { id: "details", title: "Send details", synonyms: ["send details", "details", "brochure", "share details"] },
    ],
  },
  {
    id: "call_time",
    label: "Best time to call",
    prompt: "What is the best time for our advisor to reach you?",
    kind: "buttons",
    options: [
      { id: "morning", title: "Morning (9–12)", synonyms: ["morning"] },
      { id: "afternoon", title: "Afternoon (12–4)", synonyms: ["afternoon", "lunch"] },
      { id: "evening", title: "Evening (4–8)", synonyms: ["evening", "night"] },
    ],
    when: (a) => a.next_step === "call" || a.next_step === "visit",
  },
];

export function findQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

export function optionTitle(questionId: string, optionId: unknown): string {
  if (typeof optionId !== "string") return "";
  return findQuestion(questionId)?.options.find((o) => o.id === optionId)?.title ?? "";
}

/** The next question to ask, or null when the lead has answered everything needed. */
export function nextQuestion(answers: Answers): Question | null {
  for (const q of QUESTIONS) {
    if (answers.shortcut && q.id !== "call_time") continue;
    if (q.when && !q.when(answers)) continue;
    if (!answers[q.id]) return q;
  }
  return null;
}

/**
 * Scoring. There is no budget cut-off yet, so a lead is scored on how soon
 * they plan to buy and what they asked for next. Change the points here.
 */
const POINTS: Record<string, Record<string, number>> = {
  timeline: { now: 3, "3m": 3, "6m": 2, later: 1, exploring: 0 },
  next_step: { visit: 3, call: 2, details: 0 },
};

export type Score = "Hot" | "Warm" | "Cold";

export function scoreLead(a: Answers): Score {
  let points = 0;
  for (const [qid, table] of Object.entries(POINTS)) {
    const v = a[qid];
    if (typeof v === "string") points += table[v] ?? 0;
  }
  // Sharing a budget shows intent.
  if (typeof a.budget === "string" && a.budget !== "na") points += 1;

  if (points >= 5) return "Hot";
  if (points >= 3 || a.next_step === "call" || a.next_step === "visit") return "Warm";
  return "Cold";
}

/** One-line summary for the Sheet and alerts, e.g. "3 BHK · ₹5 – 10 Cr · Investment · …". */
export function summarize(a: Answers): string {
  const parts = QUESTIONS.map((q) => optionTitle(q.id, a[q.id])).filter(Boolean);
  if (a.shortcut && !a.config) parts.push("(skipped questions)");
  return parts.join(" · ");
}

/** Follow-up schedule. Each step is sent with an approved WhatsApp template. */
export const FOLLOWUPS = {
  /** Lead never replied, or stopped mid-way. Hours after their last activity. */
  nudge: [24, 72].map((h) => h * 3600_000),
  /** Lead answered the questions. Days after they finished. */
  nurture: [3, 7, 15, 30].map((d) => d * 86_400_000),
  /** Stop after this many follow-ups in a row get no reply. */
  maxUnanswered: 3,
};

export const TEMPLATES = {
  welcome: process.env.WA_TEMPLATE_WELCOME || "lead_welcome",
  nudge: process.env.WA_TEMPLATE_NUDGE || "lead_nudge",
  followup: process.env.WA_TEMPLATE_FOLLOWUP || "lead_followup",
  /** Optional: alert to the owner's number (works outside the 24h window). */
  ownerAlert: process.env.WA_TEMPLATE_OWNER_ALERT || "",
  language: process.env.WHATSAPP_TEMPLATE_LANG || "en",
};

/**
 * Template quick-reply buttons arrive as their button text. Make the button
 * texts you create in WhatsApp Manager match one of these (case-insensitive).
 */
export const TEMPLATE_BUTTONS: Record<string, "start" | "call" | "visit" | "not_interested"> = {
  "yes, let's start": "start",
  "yes, lets start": "start",
  "yes": "start",
  "yes, continue": "start",
  "share options": "start",
  "call me instead": "call",
  "request a call": "call",
  "call me": "call",
  "book site visit": "visit",
  "site visit": "visit",
  "not interested": "not_interested",
};

/** Sheet statuses (the "Your Status" column) that stop automatic follow-ups. */
export const SHEET_STATUSES = [
  "New",
  "Contacted",
  "Site visit booked",
  "Negotiation",
  "Booked",
  "Not interested",
  "Handled by me",
  "Junk",
];
export const STOP_FOLLOWUP_STATUSES = new Set(
  ["Site visit booked", "Negotiation", "Booked", "Not interested", "Handled by me", "Junk"].map((s) => s.toLowerCase())
);
/** Sheet statuses that also stop the bot from replying (you are handling the lead). */
export const PAUSE_BOT_STATUSES = new Set(["handled by me", "junk"]);

/** After this many off-topic messages the bot stops answering them. */
export const MAX_OFF_TOPIC = 3;
/** AI calls allowed per lead per day, and for the whole bot per day. */
export const LLM_CALLS_PER_LEAD_PER_DAY = 15;
export const LLM_CALLS_PER_DAY = Number(process.env.LLM_DAILY_CAP || 1500);

const firstName = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";

/** Fixed replies. The AI never writes these, so they can't be manipulated. */
export const TEXT = {
  directWelcome: (name?: string | null) =>
    `Hello${firstName(name) ? ` ${firstName(name)}` : ""}, welcome to ${BUSINESS_NAME} 🙏\n\nI'm the virtual assistant. A few quick taps and our advisor will share the options that suit you best.`,
  startQuestions: "Wonderful! Just a few quick questions. Please tap an option below 👇",
  tapOption: "Please tap one of the options below 👇",
  offTopic: `I'm the ${BUSINESS_NAME} assistant, so I can only help with your property enquiry 🙂`,
  offTopicFinal: `I can only help with property enquiries. Our advisor will get in touch with you personally.`,
  media: "Sorry, I can only read text and button taps for now.",
  handoffQuestion: "Good question! I've passed it to our property advisor, who will answer you personally.",
  smalltalkDone: "Thank you! Our advisor will be in touch with you shortly 🙏",
  updated: "Noted, I've updated that for you ✅",
  notInterested: (name?: string | null) =>
    `Thank you for letting us know${firstName(name) ? `, ${firstName(name)}` : ""}. If your plans change, just send us a message here 🙏`,
  optedOut: "You've been unsubscribed and won't receive further messages from us. Reply START anytime to reconnect.",
  optedIn: "Welcome back! 🙏",
  completed: (name: string | null | undefined, a: Answers) => {
    const who = firstName(name) ? `, ${firstName(name)}` : "";
    const time = optionTitle("call_time", a.call_time).replace(/\s*\(.*\)/, "").toLowerCase();
    const when = time ? ` in the ${time}` : " shortly";
    let next = `Our advisor will reach out${when} with the best options for you.`;
    if (a.next_step === "visit") next = `Our advisor will call you${when} to schedule your site visit.`;
    else if (a.next_step === "call") next = `Our advisor will call you${when}.`;
    else if (a.next_step === "details") next = "Our advisor will share the details with you here shortly.";
    return `Thank you${who}! 🙏 ${next}\n\nMeanwhile, feel free to ask any question here.`;
  },
};

export const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "stop messages", "dont message", "don't message", "remove me", "block"]);
export const OPT_IN_WORDS = new Set(["start", "subscribe", "unstop"]);
export const NOT_INTERESTED_WORDS = ["not interested", "no thanks", "no thank you", "not looking", "already bought"];
export const SMALLTALK_WORDS = new Set([
  "hi", "hello", "hey", "hii", "hiii", "ok", "okay", "k", "thanks", "thank you", "thx", "ty", "great", "sure",
  "fine", "good", "👍", "🙏", "namaste", "good morning", "good evening", "done", "noted",
]);

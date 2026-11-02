import type { ConversationMetadata, ConversationResponse } from "../shared/protocol.ts";
import { PI_THINKING_LEVELS } from "../shared/launch-rules.ts";

/**
 * Models stated by the agent's own layout before its transcript exists.
 * omp is deliberately excluded: its display names require a catalog lookup, and listing
 * that catalog can refresh the CLI's OAuth credentials.
 */
type Screen = Pick<ConversationMetadata, "model" | "reasoning_effort">;
const NOTHING: Screen = { model: null, reasoning_effort: null };

/** Claude's model families and a version part, as its ids and display names write them (also conversation-metadata.ts) */
export const CLAUDE_FAMILY = "opus|sonnet|haiku|fable|mythos";
export const VERSION = "[1-9]\\d?";
const EFFORT = "none|minimal|low|medium|high|xhigh|max";

function lastMatch(lines: string[], pattern: RegExp): RegExpExecArray | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = pattern.exec(lines[index]!);
    if (match) return match;
  }
  return null;
}

/** `▝▜██████▀  Haiku 5.5 · Claude Max`, the line under `Claude Code v…`. */
function claudeScreen(lines: string[]): Screen {
  const title = lastMatch(lines, /Claude Code v\d/u);
  if (!title) return NOTHING;
  const named = new RegExp(`(?:^|\\s)(${CLAUDE_FAMILY}) (${VERSION})(?:\\.(0|${VERSION}))? · `, "iu").exec(lines[lines.indexOf(title.input) + 1] ?? "");
  if (!named) return NOTHING;
  return { model: `claude-${named[1]!.toLowerCase()}-${named[2]}${named[3] === undefined ? "" : `-${named[3]}`}`, reasoning_effort: null };
}

const CODEX_PROMPT = /^\s*›(?:\s|$)/u;

/** The lines under the last Codex session header down to its composer footer, the model and
 * effort that footer states, or null when the screen does not show both. */
function codexLayout(lines: string[]): { header: number; visible: string[]; end: number; model: RegExpExecArray } | null {
  let header = lines.length - 1;
  // the banner's own line, boxed or not: an answer that only mentions it is no header
  while (header >= 0 && !/^[\s\u2502|]*>_ OpenAI Codex \(v\d[^)]*\)[\s\u2502|]*$/u.test(lines[header]!)) header--;
  if (header < 0) return null;
  const visible = lines.slice(header + 1);
  const footer = new RegExp(`^\\s*(GPT-[\\w.-]+) (${EFFORT})(?: \\w+)? · `, "u");
  let end = visible.length - 1;
  while (end >= 0 && visible[end]!.trim() === "") end--;
  if (end < 1 || !/^\s*[←?].*(?:for agents|shortcuts)/u.test(visible[end]!)) return null;
  const model = footer.exec(visible[end - 1]!);
  if (!model || !visible.slice(0, end - 1).some((line) => CODEX_PROMPT.test(line))) return null;
  return { header, visible, end, model };
}

/** Only the live composer footer owns a Codex model. Text above it (an answer quoting the
 * /model picker, a draft) never does, and while a popup hides the footer the model is unknown. */
function codexScreen(lines: string[]): Screen {
  const found = codexLayout(lines)?.model;
  return found ? { model: found[1]!.toLowerCase(), reasoning_effort: found[2]! } : NOTHING;
}

/** A cell Codex draws for something said or done: an answer or a tool call, a warning, an error. */
const CODEX_CELL = /^\s*[•⚠■]/u;

/**
 * Whether a Codex screen is its start screen with nothing said in it yet: under the last session
 * header, its card and start tips, then the composer (the first prompt line, `›`) with what it
 * holds, then the footer. A message sent or a resumed conversation puts a prompt or an answer
 * above the composer, and a long one pushes the header off the screen; either way this says no.
 * So does one said above the header: the header may be a card a command drew (`/status`) after
 * a conversation, or a session started after another one in the same terminal.
 */
export function codexStartScreenUnused(screen: string): boolean {
  const all = screen.split("\n");
  const layout = codexLayout(all);
  if (layout === null || all.slice(0, layout.header).some((line) => CODEX_PROMPT.test(line) || CODEX_CELL.test(line))) return false;
  const lines = layout.visible.slice(0, layout.end - 1);
  const composer = lines.findIndex((line) => CODEX_PROMPT.test(line));
  return composer >= 0 && !lines.slice(0, composer).some((line) => CODEX_CELL.test(line))
    && !lines.slice(composer + 1).some((line) => CODEX_PROMPT.test(line) || CODEX_CELL.test(line));
}

/** ` ⬢ opus-5.5 · ◉ xhigh · 1.5% / …`, the status line over the composer. */
function gjcScreen(lines: string[]): Screen {
  const found = lastMatch(lines, new RegExp(`⬢ (\\S+) · ◉ (${EFFORT})(?: |$)`, "u"));
  if (!found) return NOTHING;
  const claude = new RegExp(`^(${CLAUDE_FAMILY})-(${VERSION})(?:\\.(0|${VERSION}))?$`, "u").exec(found[1]!);
  const model = claude ? `claude-${claude[1]}-${claude[2]}${claude[3] === undefined ? "" : `-${claude[3]}`}` : found[1]!;
  return { model, reasoning_effort: found[2]! };
}

/**
 * pi's footer, drawn under its composer from its first frame: `<cwd> 0.0%/262k (auto) … <model> • <level>`.
 * The context readout is the anchor: that line is the only place pi draws it, so a bullet in an answer,
 * or a message that merely quotes a percentage, cannot pass for the footer. The model sits at the line's
 * right end exactly as pi shows it — its own id, not a display name — and ` • <level>` is there only when
 * the model thinks. pi writes no session file until its first prompt is sent, so this is the only place
 * the model of a pi pane that has not answered yet can come from. Verified on pi 1.4.0, 2026-11-01.
 * The level word comes from the same list the launch flags are checked against, so the two cannot drift.
 */
const PI_READOUT = "\\d+(?:\\.\\d+)?%/\\d+(?:\\.\\d+)?[km]\\b(?:\\s*\\([a-z]+\\))?";
const PI_FOOTER = new RegExp(`${PI_READOUT}[\\s\\u2502|]*?(\\S+) \\u2022 (${PI_THINKING_LEVELS.join("|")})[\\s\\u2502|]*$`, "u");
/** the same footer with no thinking level: pi draws the model alone when the model does not think */
const PI_FOOTER_NO_LEVEL = new RegExp(`${PI_READOUT}[\\s\\u2502|]*(\\S+)[\\s\\u2502|]*$`, "u");

function piScreen(lines: string[]): Screen {
  const thought = lastMatch(lines, PI_FOOTER);
  if (thought) return { model: thought[1]!, reasoning_effort: thought[2]! };
  const plain = lastMatch(lines, PI_FOOTER_NO_LEVEL);
  return plain ? { model: plain[1]!, reasoning_effort: null } : NOTHING;
}

const SCREENS: Partial<Record<ConversationResponse["source"], (lines: string[]) => Screen>> = {
  "claude-transcript": claudeScreen,
  "codex-transcript": codexScreen,
  "gjc-transcript": gjcScreen,
  // pi too: its transcript's first `model_change` line only appears once a prompt has been sent, while
  // its footer states the model from the first frame. `cmd` is deliberately not here: its status line
  // was not read from a live session, so its wording is not known to this parser.
  "pi-transcript": piScreen,
};

export function readsStartScreen(source: ConversationResponse["source"]): boolean {
  return SCREENS[source] !== undefined;
}

export function startScreenMetadata(source: ConversationResponse["source"], screen: string): Screen {
  return SCREENS[source]?.(screen.split("\n")) ?? NOTHING;
}

import { describe, expect, it } from "bun:test";

import { codexStartScreenUnused, readsStartScreen, startScreenMetadata } from "./start-screen.ts";

const CLAUDE = [
  " ▐▛███▛█   Claude Code v2.1.296",
  "▝▜██████▀  Haiku 5.5 · Claude Max",
  " ▝▝   ▝▝   ~/workspace/test-project",
  "────────────────────────────────────────",
  "❯ Try \"fix lint errors\"",
  "────────────────────────────────────────",
  "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
].join("\n");

const CODEX = [
  "  >_ OpenAI Codex (v0.162.1)",
  "     /tmp/test-project",
  "  permissions: YOLO mode",
  "  /model - choose what model and reasoning effort to use",
  "› Ask Codex to do anything",
  "  GPT-6-Luna medium fast · /tmp/test-project",
  "  ← for agents · ? for shortcuts",
].join("\n");

const GJC = [
  "│                 [ ⬢ Anthropic Opus 5.5 ]                 │ ─────────────── │",
  "╰──────────────────────────────────────────────────────────┴─────────────────╯",
  " ⬢ opus-5.5 · ◉ xhigh · 1.5% / ⑂ main / 📁 …/test-project ───── (sub) / v0.17.7",
  "│ > Type your message... ⌥Q: Queue (busy) · ⇧⇥: Thinking │",
].join("\n");

describe("startScreenMetadata", () => {
  it("reads Claude Code's model under its title, as the id its transcript records", () => {
    expect(startScreenMetadata("claude-transcript", CLAUDE)).toEqual({ model: "claude-haiku-5-5", reasoning_effort: null });
    expect(startScreenMetadata("claude-transcript", CLAUDE.replace("Haiku 5.5", "Sonnet 5"))).toEqual({ model: "claude-sonnet-5", reasoning_effort: null });
  });

  it("names no Claude model it cannot give an id for certain", () => {
    expect(startScreenMetadata("claude-transcript", CLAUDE.replace("Haiku 5.5", "Opus 5.5 (1M context)")).model).toBeNull();
    expect(startScreenMetadata("claude-transcript", CLAUDE.replace("Haiku 5.5", "Default")).model).toBeNull();
    expect(startScreenMetadata("claude-transcript", "Accessing workspace\nIs this a project you created or one you trust?").model).toBeNull();
  });

  it("reads Codex's model and effort from the line under its composer", () => {
    expect(startScreenMetadata("codex-transcript", CODEX)).toEqual({ model: "gpt-6-luna", reasoning_effort: "medium" });
    expect(startScreenMetadata("codex-transcript", CODEX.replace("GPT-6-Luna medium fast", "GPT-5.6 xhigh"))).toEqual({ model: "gpt-5.6", reasoning_effort: "xhigh" });
  });

  it("reads nothing of a Codex screen without its header or its status line", () => {
    expect(startScreenMetadata("codex-transcript", "  GPT-6-Luna medium fast · /tmp/test-project")).toEqual({ model: null, reasoning_effort: null });
    expect(startScreenMetadata("codex-transcript", "  >_ OpenAI Codex (v0.162.1)\n  Trust this folder?\n› 1. Trust and continue")).toEqual({ model: null, reasoning_effort: null });
  });

  it("takes the model only from the live footer, never from a quoted picker, a draft or a popup", () => {
    const header = "  >_ OpenAI Codex (v0.162.1)";
    const quoted = CODEX.replace(header, `${header}\n• Run /model. You will see:\n  Select Model\n  1. gpt-evil (current)`);
    expect(startScreenMetadata("codex-transcript", quoted)).toEqual({ model: "gpt-6-luna", reasoning_effort: "medium" });
    const draft = CODEX.replace("› Ask Codex to do anything", "› note\n  Select Model\n  1. gpt-typed (current)");
    expect(startScreenMetadata("codex-transcript", draft)).toEqual({ model: "gpt-6-luna", reasoning_effort: "medium" });
    const picker = [header, "  Select Model and Effort", "› 1. GPT-6.1-Sol (default) (current)", "  2. GPT-6-Astra", "  Press enter to select · esc to go back"].join("\n");
    expect(startScreenMetadata("codex-transcript", picker)).toEqual({ model: null, reasoning_effort: null });
    expect(startScreenMetadata("codex-transcript", `${header}\n  GPT-6-Sol high · /tmp/project`)).toEqual({ model: null, reasoning_effort: null });
  });

  it("tells a Codex start screen with nothing said yet from one with a conversation", () => {
    const header = "  >_ OpenAI Codex (v0.162.1)";
    expect(codexStartScreenUnused(CODEX)).toBeTrue();
    // a draft in the composer is not a message
    expect(codexStartScreenUnused(CODEX.replace("\u203a Ask Codex to do anything", "\u203a fix the\n  build"))).toBeTrue();
    // a message sent, its answer, an error; or a resumed conversation shown under its header
    const said = (cells: string) => CODEX.replace("\u203a Ask Codex to do anything", `${cells}\n\n\u203a Ask Codex to do anything`);
    expect(codexStartScreenUnused(said("\u203a hello\n\n\u2022 Hi! What should we work on?"))).toBeFalse();
    expect(codexStartScreenUnused(said("\u203a hello"))).toBeFalse();
    expect(codexStartScreenUnused(said("\u25a0 stream disconnected before completion"))).toBeFalse();
    expect(codexStartScreenUnused(CODEX.replace(header, `${header}\n\u2022 Explored\n  \u2514 Read app.ts`))).toBeFalse();
    // no header, no footer, or a popup over the footer: nothing to tell by
    expect(codexStartScreenUnused(CODEX.replace(header, ""))).toBeFalse();
    expect(codexStartScreenUnused(CODEX.replace("  \u2190 for agents \u00b7 ? for shortcuts", ""))).toBeFalse();
    expect(codexStartScreenUnused([header, "  Select Model and Effort", "\u203a 1. GPT-6.1-Sol (default) (current)"].join("\n"))).toBeFalse();
    // a header drawn under a conversation (a command's card, a second session in the same terminal)
    expect(codexStartScreenUnused(`\u203a hello\n\n\u2022 Hi there\n\n${CODEX}`)).toBeFalse();
    // an answer that only mentions the banner is no header, with the real one scrolled away
    expect(codexStartScreenUnused(CODEX.replace(header, "  the tail of an answer\n\u2022 OpenAI Codex (v0.163.0)"))).toBeFalse();
    // the banner boxed, as some versions draw it
    expect(codexStartScreenUnused(CODEX.replace(header, "\u2502 >_ OpenAI Codex (v0.163.0) \u2502"))).toBeTrue();
  });

  it("reads gjc's status line, keeping a model it has no id for as gjc wrote it", () => {
    expect(startScreenMetadata("gjc-transcript", GJC)).toEqual({ model: "claude-opus-5-5", reasoning_effort: "xhigh" });
    expect(startScreenMetadata("gjc-transcript", GJC.replace("opus-5.5", "kimi-k3"))).toEqual({ model: "kimi-k3", reasoning_effort: "xhigh" });
  });

  it("reads pi's footer, which states the model and level from its first frame", () => {
    // pi's own footer row, as herdr's text read of the live viewport gives it (pi 1.4.0, 2026-11-01): the
    // cwd, then the context readout, then the model and its thinking level at the right end. pi writes the
    // model id alone, without the provider that serves it, and it writes no session file until a prompt is
    // sent, so this row is all there is to go by before the first answer.
    const pi = [
      " \u259d\u259c\u2588\u2588\u2588\u2588\u2588\u2588\u2580 pi v1.4.0",
      " \u2588\u2580 \u2588 escape interrupt \u00b7 ctrl+c/ctrl+d clear/exit \u00b7 / commands \u00b7 ! bash \u00b7 ctrl+o more",
      "/tmp/ovis-repro                                0.0%/262k (auto)                    zorro-davidau-3.8-flash-next \u2022 xhigh",
    ].join("\n");
    expect(startScreenMetadata("pi-transcript", pi)).toEqual({ model: "zorro-davidau-3.8-flash-next", reasoning_effort: "xhigh" });
    // the model alone, as pi draws it when the model does not think
    expect(startScreenMetadata("pi-transcript", pi.replace(" \u2022 xhigh", ""))).toEqual({ model: "zorro-davidau-3.8-flash-next", reasoning_effort: null });
    // every level pi names on its footer
    for (const level of ["off", "minimal", "low", "medium", "high", "xhigh", "max"]) {
      expect(startScreenMetadata("pi-transcript", pi.replace("xhigh", level))).toEqual({ model: "zorro-davidau-3.8-flash-next", reasoning_effort: level });
    }
    // the readout is the anchor: a line that only names a percentage, or only ends in a level word, is no footer
    expect(startScreenMetadata("pi-transcript", "\u2022 used 50%/200k of the context")).toEqual({ model: null, reasoning_effort: null });
    expect(startScreenMetadata("pi-transcript", "\u2022 the model can think high")).toEqual({ model: null, reasoning_effort: null });
    // a footer scrolled off screen, or a pane that draws none, says nothing rather than guessing
    expect(startScreenMetadata("pi-transcript", " \u2588\u2580 \u2588 escape interrupt")).toEqual({ model: null, reasoning_effort: null });
    // pi's footer is pi's screen alone: codex's footer is not read as pi's
    expect(startScreenMetadata("pi-transcript", CODEX)).toEqual({ model: null, reasoning_effort: null });
  });

  it("reads only the agents whose screen it knows", () => {
    expect(readsStartScreen("codex-transcript")).toBeTrue();
    // pi too: its transcript begins only with the first prompt, while its footer is drawn from the start
    expect(readsStartScreen("pi-transcript")).toBeTrue();
    // cmd writes pi's transcript format but draws its own screen, which has not been read from a live session
    expect(readsStartScreen("cmd-transcript")).toBeFalse();
    expect(readsStartScreen("opencode-transcript")).toBeFalse();
    expect(startScreenMetadata("omo-transcript", CODEX)).toEqual({ model: null, reasoning_effort: null });
    expect(startScreenMetadata("claude-transcript", CODEX)).toEqual({ model: null, reasoning_effort: null });
  });
});


"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROMPT_ANSWER_MAX, PROMPTS, type PromptKey } from "@/lib/profile-options";
import { charLength, validatePrompt } from "@/lib/profile-validation";
import SaveStatus, { useSaveState } from "./save-status";

const PROMPT_LIST = Object.entries(PROMPTS) as [PromptKey, string][];

// One prompt and a short answer, a ready-made opener for anyone who visits. The database
// stores the two together or not at all, so validatePrompt turns "No prompt" or an empty
// answer into null for both.
export default function PromptForm({
  userId,
  initial,
}: {
  userId: string;
  initial: { key: PromptKey; answer: string } | null;
}) {
  const router = useRouter();
  const [key, setKey] = useState<PromptKey | "">(initial?.key ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const save = useSaveState();
  const length = charLength(answer.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const checked = validatePrompt(key, answer);
    if (!checked.ok) return save.failed(checked.error);

    save.saving();
    const { error } = await createClient().from("profiles").update(checked.value).eq("id", userId);
    if (error) {
      console.error(error);
      return save.failed(
        error.code === "23514" ? "That answer was not accepted. Shorten it and try again." : "Could not save. Try again.",
      );
    }
    // Reflect what is stored: if the pair was cleared, clear both boxes too.
    setKey(checked.value.prompt_key ?? "");
    setAnswer(checked.value.prompt_answer ?? "");
    save.saved();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="prompt-key" className="text-sm opacity-80">
        Pick a prompt
      </label>
      <select
        id="prompt-key"
        value={key}
        onChange={(e) => {
          setKey(e.target.value as PromptKey | "");
          save.reset();
        }}
        className="field"
      >
        <option value="">No prompt</option>
        {PROMPT_LIST.map(([k, text]) => (
          <option key={k} value={k}>
            {text}
          </option>
        ))}
      </select>

      {/* Hidden until a prompt is picked, so an answer cannot be typed and then silently
          dropped on save. */}
      {key !== "" && (
        <>
          <div className="mt-2 flex items-baseline justify-between">
            <label htmlFor="prompt-answer" className="text-sm opacity-80">
              Your answer
            </label>
            <span id="prompt-count" className={`text-xs ${length > PROMPT_ANSWER_MAX ? "text-red-500" : "opacity-60"}`}>
              {length}/{PROMPT_ANSWER_MAX}
            </span>
          </div>
          <textarea
            id="prompt-answer"
            rows={2}
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              save.reset();
            }}
            aria-describedby="prompt-count prompt-help"
            placeholder="Keep it short"
            className="field resize-none"
          />
          <p id="prompt-help" className="text-xs opacity-60">
            Leave it empty to remove the prompt from your profile.
          </p>
        </>
      )}

      <button type="submit" disabled={save.busy} className="btn mt-2">
        {save.busy ? "Saving..." : "Save"}
      </button>
      <SaveStatus state={save.state} />
    </form>
  );
}

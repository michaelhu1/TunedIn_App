// The three pages of Edit profile. Kept in a plain file so both the server page (which reads
// ?tab= from the address) and the browser-side editor can use the same list.
export const EDITOR_TABS = [
  { id: "you", label: "You" },
  { id: "music", label: "Music taste" },
  { id: "showcase", label: "Showcase" },
] as const;
export type EditorTab = (typeof EDITOR_TABS)[number]["id"];

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMailStore } from "@/lib/mail/view-store";
import type { MessageSummary } from "@/lib/mail/queries";

type Sent = { ids?: string[]; action: string };

const sent: Sent[] = [];

function message(id: string, seen: boolean): MessageSummary {
  return {
    id,
    threadId: `thr_${id}`,
    subject: id,
    from: { address: "someone@example.com" },
    to: [],
    snippet: "",
    sentAt: 0,
    seen,
    flagged: false,
    draft: false,
    hasAttachments: false,
    folderId: "fld_inbox",
    threadCount: 1,
  };
}

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/messages/bulk")) {
      sent.push(JSON.parse(String(init?.body)) as Sent);
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  useMailStore.setState({
    mailboxId: "mbx_1",
    folderId: "fld_inbox",
    messages: [message("a", true), message("b", false), message("c", false)],
    folders: [{ id: "fld_inbox", name: "Inbox", role: "inbox", unread: 2 }],
    selectedId: "a",
    checked: new Set(),
    loaded: new Map(),
    undoStack: [],
  });
});

/** Batched read marks are flushed on a timer; give them a beat to land. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 500));
}

describe("reading follows the cursor", () => {
  it("marks a message read when it is selected", async () => {
    useMailStore.getState().select("b");
    expect(useMailStore.getState().messages.find((m) => m.id === "b")?.seen).toBe(true);

    await settle();
    expect(sent).toContainEqual({ mailboxId: "mbx_1", ids: ["b"], action: "read" });
  });

  it("marks the message a delete lands on, not just one reached by the arrow keys", async () => {
    // Removing the selected row advances the cursor to the next message, and landing
    // there has to count as reading it the same way stepping onto it would.
    useMailStore.getState().trash(["a"]);

    const state = useMailStore.getState();
    expect(state.selectedId).toBe("b");
    expect(state.messages.find((m) => m.id === "b")?.seen).toBe(true);

    await settle();
    expect(sent.some((body) => body.action === "read" && body.ids?.includes("b"))).toBe(true);
  });

  it("sends one request for a run through the list rather than one each", async () => {
    useMailStore.getState().select("b");
    useMailStore.getState().select("c");

    await settle();
    const reads = sent.filter((body) => body.action === "read");
    expect(reads).toHaveLength(1);
    expect(reads[0]?.ids).toEqual(["b", "c"]);
  });

  it("does not re-send a message that was already read", async () => {
    useMailStore.getState().select("a");
    await settle();
    expect(sent.filter((body) => body.action === "read")).toHaveLength(0);
  });
});

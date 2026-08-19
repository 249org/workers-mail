import { describe, expect, it, vi } from "vitest";

/**
 * Drives ImapMutator against a scripted server so the APPEND framing is checked
 * without a network: the literal byte count, the wait for `+`, and the trailing CRLF
 * are the parts a server rejects outright when they are wrong.
 */
const lines: string[] = [];
const written: Uint8Array[] = [];
let script: string[] = [];

vi.mock("@/lib/transport/oauth-connect", () => ({
  connectImapSocket: async () => ({
    reader: {
      readLine: async () => script.shift() ?? "",
      readN: async () => new Uint8Array(),
      peek: async () => new Uint8Array(),
      cancel: async () => undefined,
    },
    writer: {
      write: async (chunk: Uint8Array) => {
        written.push(chunk);
      },
      writeLine: async (line: string) => {
        lines.push(line);
      },
      close: async () => undefined,
    },
    closed: Promise.resolve(),
    close: async () => undefined,
    startTls: () => {
      throw new Error("not used");
    },
    [Symbol.asyncDispose]: async () => undefined,
  }),
}));

const { ImapMutator } = await import("@/lib/transport/imap-commands");

const credentials = {
  hostname: "imap.one.com",
  port: 993,
  tls: "implicit" as const,
  username: "support@mena-speakers.com",
  password: "secret",
  mechanism: "password" as const,
};

async function open() {
  lines.length = 0;
  written.length = 0;
  script = ["* OK ready", "m001 OK LOGIN done"];
  return ImapMutator.open(credentials);
}

describe("appendMessage", () => {
  it("sends the literal size, waits for the continuation, then the body", async () => {
    const session = await open();
    script.push("+ go ahead", "m002 OK [APPENDUID 1 9] APPEND done");

    const raw = new TextEncoder().encode("Subject: hi\r\n\r\nbody\r\n");
    await session.appendMessage("Sent", raw, ["\\Seen"]);

    const command = lines.find((line) => line.includes("APPEND"));
    expect(command).toBe(`m002 APPEND "Sent" (\\Seen) {${raw.byteLength}}`);
    expect(written[0]).toEqual(raw);
    // The literal is terminated by its own CRLF after the octets.
    expect(lines[lines.length - 1]).toBe("");
  });

  it("counts the appended CRLF when the message does not end with one", async () => {
    const session = await open();
    script.push("+ ok", "m002 OK done");

    const raw = new TextEncoder().encode("Subject: hi\r\n\r\nbody");
    await session.appendMessage("Sent", raw);

    const command = lines.find((line) => line.includes("APPEND"));
    expect(command).toBe(`m002 APPEND "Sent" {${raw.byteLength + 2}}`);
    expect(written[0]?.byteLength).toBe(raw.byteLength + 2);
  });

  it("encodes a non-ascii mailbox name as modified UTF-7", async () => {
    const session = await open();
    script.push("+ ok", "m002 OK done");
    await session.appendMessage("Café", new TextEncoder().encode("x\r\n"));
    expect(lines.find((line) => line.includes("APPEND"))).toContain('"Caf&AOk-"');
  });

  it("fails when the server refuses instead of asking for the literal", async () => {
    const session = await open();
    script.push("m002 NO over quota");
    await expect(
      session.appendMessage("Sent", new TextEncoder().encode("x\r\n")),
    ).rejects.toThrow(/over quota/);
  });
});

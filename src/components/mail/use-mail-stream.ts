"use client";

import { useEffect, useRef, useState } from "react";
import type { MailboxEvent } from "@/lib/mail/events";

export type StreamState = "connecting" | "open" | "polling";

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const POLL_INTERVAL_MS = 15_000;
const HEARTBEAT_MS = 30_000;
const OPEN_TIMEOUT_MS = 6_000;

/**
 * Keeps a WebSocket to the mailbox's Durable Object open, and falls back to a plain
 * interval refresh when the socket cannot stay up.
 */
export function useMailStream(mailboxId: string, onEvent: (event: MailboxEvent) => void) {
  const [state, setState] = useState<StreamState>("connecting");
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let disposed = false;

    function startPolling() {
      if (poll || disposed) return;
      setState("polling");
      poll = setInterval(() => handler.current({ type: "sync", state: "idle" }), POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (!poll) return;
      clearInterval(poll);
      poll = null;
    }

    function connect() {
      if (disposed) return;
      // Only the first attempt reads as "connecting"; later retries keep showing the
      // polling fallback, which is what is actually serving the UI at that point.
      if (attempt === 0) setState("connecting");

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/mail/stream?mailbox=${encodeURIComponent(mailboxId)}`,
      );

      // An upgrade that is neither accepted nor refused leaves the socket stuck in
      // CONNECTING with no event ever firing, so nothing would trigger the fallback.
      // Give it a deadline and treat silence as failure.
      const deadline = setTimeout(() => {
        if (socket?.readyState === WebSocket.CONNECTING) socket.close();
      }, OPEN_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(deadline);
        attempt = 0;
        stopPolling();
        setState("open");
        heartbeat = setInterval(() => socket?.send(JSON.stringify({ type: "ping" })), HEARTBEAT_MS);
      };

      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(event.data as string) as MailboxEvent);
        } catch {
          // Ignore frames that are not part of the protocol.
        }
      };

      socket.onclose = () => {
        clearTimeout(deadline);
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (disposed) return;

        startPolling();
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 30_000;
        attempt += 1;
        retry = setTimeout(connect, delay);
      };

      socket.onerror = () => socket?.close();
    }

    connect();

    return () => {
      disposed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (retry) clearTimeout(retry);
      stopPolling();
      socket?.close();
    };
  }, [mailboxId]);

  return state;
}

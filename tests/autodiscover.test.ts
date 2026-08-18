import { describe, expect, it } from "vitest";
import {
  discoverMailServers,
  mxOrgCandidates,
  parseClientConfig,
} from "@/lib/transport/autodiscover";
import { providerForMxHost } from "@/lib/transport/presets";

const ONE_COM_MX = "10 mx1.pub.mailpod9-cph3.one.com.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/dns-json" },
  });
}

function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { "content-type": "application/xml" } });
}

function fetchRouter(handlers: (url: string) => Response | null): typeof fetch {
  return async (input) => {
    const url = String(input);
    return handlers(url) ?? new Response(null, { status: 404 });
  };
}

describe("providerForMxHost", () => {
  it("maps a one.com mailpod MX to imap.one.com", () => {
    expect(providerForMxHost("mx1.pub.mailpod9-cph3.one.com")?.imapHost).toBe("imap.one.com");
    expect(providerForMxHost("mx1.pub.mailpod9-cph3.one.com")?.smtpHost).toBe("send.one.com");
  });

  it("does not treat someone.com as one.com", () => {
    expect(providerForMxHost("mx.someone.com")).toBeNull();
  });

  it("maps Google Workspace MX to Gmail IMAP", () => {
    expect(providerForMxHost("aspmx.l.google.com")?.imapHost).toBe("imap.gmail.com");
  });
});

describe("mxOrgCandidates", () => {
  it("takes the registrable domain from a one.com mailpod", () => {
    expect(mxOrgCandidates("mx1.pub.mailpod9-cph3.one.com")).toEqual([
      "one.com",
      "mailpod9-cph3.one.com",
    ]);
  });
});

describe("parseClientConfig", () => {
  it("reads IMAP and SMTP from Mozilla autoconfig XML", () => {
    const hosts = parseClientConfig(`
      <clientConfig version="1.1">
        <emailProvider id="one.com">
          <incomingServer type="pop3"><hostname>pop.one.com</hostname><port>995</port></incomingServer>
          <incomingServer type="imap"><hostname>imap.one.com</hostname><port>993</port></incomingServer>
          <outgoingServer type="smtp"><hostname>send.one.com</hostname><port>465</port></outgoingServer>
        </emailProvider>
      </clientConfig>
    `);
    expect(hosts).toMatchObject({
      provider: "one.com",
      imapHost: "imap.one.com",
      imapPort: 993,
      smtpHost: "send.one.com",
      smtpPort: 465,
    });
  });

  it("ignores configs that only publish port 25", () => {
    expect(
      parseClientConfig(`
        <incomingServer type="imap"><hostname>mail.example.com</hostname><port>993</port></incomingServer>
        <outgoingServer type="smtp"><hostname>mail.example.com</hostname><port>25</port></outgoingServer>
      `),
    ).toBeNull();
  });
});

describe("discoverMailServers", () => {
  it("uses MX to find one.com for a custom domain, without guessing imap.{domain}", async () => {
    const requested: string[] = [];
    const result = await discoverMailServers("support@mena-speakers.com", {
      fetch: fetchRouter((url) => {
        requested.push(url);
        if (url.includes("name=mena-speakers.com") && url.includes("type=MX")) {
          return jsonResponse({ Answer: [{ data: ONE_COM_MX }] });
        }
        return null;
      }),
    });

    expect(result).toMatchObject({
      found: true,
      provider: "one.com",
      source: "mx",
      imapHost: "imap.one.com",
      imapPort: 993,
      smtpHost: "send.one.com",
      smtpPort: 465,
    });
    if (result.found) {
      expect(result.detail).toContain("one.com");
      expect(result.detail).toContain("mx1.pub.mailpod9-cph3.one.com");
    }
    expect(requested.some((url) => url.includes("imap.mena-speakers.com"))).toBe(false);
  });

  it("does not invent imap.{domain} when MX points at an unknown host", async () => {
    const result = await discoverMailServers("ada@unknown-host.example", {
      fetch: fetchRouter((url) => {
        if (url.includes("type=MX")) {
          return jsonResponse({ Answer: [{ data: "10 mail.unknown-host.example." }] });
        }
        return null;
      }),
    });

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.detail).toMatch(/No IMAP settings/);
    }
  });

  it("prefers SRV records when both IMAP and SMTP are published", async () => {
    const result = await discoverMailServers("ada@srv.example", {
      fetch: fetchRouter((url) => {
        if (url.includes("_imaps._tcp.srv.example")) {
          return jsonResponse({ Answer: [{ data: "0 1 993 imap.host.example." }] });
        }
        if (url.includes("_submissions._tcp.srv.example")) {
          return jsonResponse({ Answer: [{ data: "0 1 465 smtp.host.example." }] });
        }
        if (url.includes("type=MX")) {
          return jsonResponse({ Answer: [{ data: ONE_COM_MX }] });
        }
        return null;
      }),
    });

    expect(result).toMatchObject({
      found: true,
      source: "srv",
      imapHost: "imap.host.example",
      imapPort: 993,
      smtpHost: "smtp.host.example",
      smtpPort: 465,
    });
  });

  it("uses published autoconfig XML for the address domain", async () => {
    const result = await discoverMailServers("ada@autoconfig.example", {
      fetch: fetchRouter((url) => {
        if (url === "https://autoconfig.autoconfig.example/mail/config-v1.1.xml") {
          return xmlResponse(`
            <clientConfig>
              <emailProvider id="hosted.example">
                <incomingServer type="imap"><hostname>imap.hosted.example</hostname><port>993</port></incomingServer>
                <outgoingServer type="smtp"><hostname>smtp.hosted.example</hostname><port>587</port></outgoingServer>
              </emailProvider>
            </clientConfig>
          `);
        }
        return null;
      }),
    });

    expect(result).toMatchObject({
      found: true,
      source: "autoconfig",
      imapHost: "imap.hosted.example",
      smtpHost: "smtp.hosted.example",
    });
  });

  it("falls back to the Mozilla ISP database for the MX organisation", async () => {
    const result = await discoverMailServers("ada@customer.example", {
      fetch: fetchRouter((url) => {
        if (url.includes("name=customer.example") && url.includes("type=MX")) {
          return jsonResponse({ Answer: [{ data: "10 mx.migadu.com." }] });
        }
        if (url === "https://autoconfig.thunderbird.net/v1.1/migadu.com") {
          return xmlResponse(`
            <clientConfig>
              <emailProvider id="migadu.com">
                <incomingServer type="imap"><hostname>imap.migadu.com</hostname><port>993</port></incomingServer>
                <outgoingServer type="smtp"><hostname>smtp.migadu.com</hostname><port>465</port></outgoingServer>
              </emailProvider>
            </clientConfig>
          `);
        }
        return null;
      }),
    });

    expect(result).toMatchObject({
      found: true,
      source: "ispdb",
      imapHost: "imap.migadu.com",
      smtpHost: "smtp.migadu.com",
    });
  });

  it("uses the consumer directory for gmail.com without DNS", async () => {
    const result = await discoverMailServers("ada@gmail.com", {
      fetch: fetchRouter(() => {
        throw new Error("directory hits must not fetch");
      }),
    });
    expect(result).toMatchObject({ found: true, source: "directory", imapHost: "imap.gmail.com" });
  });
});

import { describe, expect, it } from "vitest";
import { findVerificationCode } from "@/lib/mail/verification-code";

const code = (subject: string, body = "") => findVerificationCode(subject, body)?.code ?? null;

describe("finding a one-time code", () => {
  it("reads the LinkedIn reset mail, subject and body alike", () => {
    const subject = "Ayman, here's your PIN 990368";
    const body =
      "Hi Ayman,\n\nEnter this code to complete the reset.\n\n990368\n\n" +
      "If you didn't request this pin, we recommend you change your LinkedIn password.";
    expect(findVerificationCode(subject, body)).toEqual({ code: "990368", from: "subject" });
    expect(findVerificationCode("A message for you", body)).toEqual({
      code: "990368",
      from: "body",
    });
  });

  it("handles the ways a code is usually announced", () => {
    expect(code("", "Your verification code is 123456")).toBe("123456");
    expect(code("", "847201 is your Apple ID verification code.")).toBe("847201");
    expect(code("", "Use this one-time passcode to sign in: 48213")).toBe("48213");
    expect(code("", "Your security code: 9021")).toBe("9021");
    expect(code("", "Enter the code below to confirm your email\n\n5502918")).toBe("5502918");
    expect(code("Your Stripe verification code", "291043")).toBe("291043");
  });

  it("keeps the prefix a sender made part of the code", () => {
    // Google sends `G-123456` and the field it is typed into expects to see it.
    expect(code("", "G-472913 is your Google verification code")).toBe("G-472913");
  });

  it("reads a code that is letters as well as digits", () => {
    expect(code("", "Your confirmation code is 7HQ2XB")).toBe("7HQ2XB");
  });

  it("takes the code nearest the top when a message repeats it", () => {
    const body = "Your verification code is 100200.\n\nStill stuck? Quote 100200 to support.";
    expect(code("", body)).toBe("100200");
  });
});

describe("what it refuses to call a code", () => {
  it("leaves ordinary mail alone", () => {
    expect(code("Re: lunch on Thursday", "Shall we say 1pm at the usual place?")).toBeNull();
    expect(code("", "")).toBeNull();
    expect(code("Newsletter", "Read more about what we shipped in 2026.")).toBeNull();
  });

  it("does not offer a reference somebody else's system issued", () => {
    /*
     * These are the numbers that look most like codes and are the most damaging to get
     * wrong: pasted into a login box they fail, and the next real code is not believed.
     */
    expect(code("Your order 4829105 has shipped", "Tracking code 772910 is on its way")).toBeNull();
    expect(code("", "Invoice 200417 is attached.")).toBeNull();
    expect(code("", "Your booking reference is 88213.")).toBeNull();
    expect(code("", "Quote case number 4471 when you reply.")).toBeNull();
    expect(code("", "Account number 6612 ending in 09.")).toBeNull();
  });

  it("is not put off by the sentences a code email always carries", () => {
    /*
     * "In case you didn't request this" and "for your reference" are boilerplate in
     * exactly the mail this feature exists for. Reading `case` and `reference` as labels
     * for a number threw away the code the message was sent to deliver.
     */
    expect(code("", "Your verification code is 220481. In case you didn't request it, ignore this.")).toBe("220481");
    expect(code("", "For your reference, the security code is 905512.")).toBe("905512");
    expect(code("", "Enter 338190 to confirm. Need help? Open a support ticket.")).toBe("338190");
  });

  it("does not read a phone number as a code", () => {
    expect(code("", "Need a code? Call us on 800 555 0199 any time.")).toBeNull();
    expect(code("", "Verification desk: +44 20 7946 0958")).toBeNull();
  });

  it("does not read a duration or an amount as a code", () => {
    expect(code("", "Your login code expires in 3600 seconds.")).toBeNull();
    expect(code("", "Verification complete. Total 1250 USD.")).toBeNull();
    expect(code("", "Your code is worth $2500 off.")).toBeNull();
  });

  it("does not read a year as a code", () => {
    expect(code("", "Enter your code at the desk. Copyright 2026 Acme.")).toBeNull();
    // Unless the words really do say that is the code.
    expect(code("", "Your verification code is 2024")).toBe("2024");
  });

  it("does not offer a discount code, which nobody is waiting on", () => {
    expect(code("", "Use code SAVE20 at the checkout for 20% off.")).toBeNull();
    expect(code("", "Your promo code BLACK26 ends on Friday.")).toBeNull();
  });

  it("needs a number, not a shouted word", () => {
    expect(code("", "Your verification code is PENDING")).toBeNull();
    expect(code("", "NOTICE: verify your account")).toBeNull();
  });

  it("ignores a run too long or too short to be a code", () => {
    expect(code("", "Your verification code is 12")).toBeNull();
    expect(code("", "Your verification code is 1234567890123")).toBeNull();
  });

  it("does not go hunting through a newsletter for a number", () => {
    // Only the top of a message is read; a code mail says so straight away.
    const long = `${"Unrelated prose. ".repeat(400)}Your verification code is 556677`;
    expect(code("", long)).toBeNull();
  });
});

describe("when the subject is what names the code", () => {
  it("takes a number the body prints on its own line", () => {
    expect(findVerificationCode("Your Stripe verification code", "291043")?.code).toBe("291043");
    expect(
      findVerificationCode("Here is your one-time code", "Hi Ayman,\n\n884210\n\nThanks.")?.code,
    ).toBe("884210");
  });

  it("still refuses a number with other words beside it", () => {
    /*
     * Without this the subject would wave through the first figure in anything, and a
     * receipt headed "your order code" would offer up its total.
     */
    expect(
      findVerificationCode("Your verification code", "We charged card 4242 on Tuesday."),
    ).toBeNull();
  });

  it("still refuses when something beside the number says what it really is", () => {
    // The subject naming a code does not outrank an order number sitting right there.
    expect(
      findVerificationCode("Your verification code", "Order 998123 shipped.\n\n445566"),
    ).toBeNull();
  });
});

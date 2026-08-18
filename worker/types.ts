export type IngestJob = {
  /** R2 key holding the raw MIME captured by the email handler. */
  inboundKey: string;
  mailboxId: string;
  ownerId: string;
  to: string;
  from: string;
  size: number;
  receivedAt: number;
};

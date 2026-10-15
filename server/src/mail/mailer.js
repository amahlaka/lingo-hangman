// Sends one rendered mail. Replaceable by configuration: "smtp" sends for
// real (only set on the server), "log" writes recipient and template only,
// "memory" keeps mails for tests. Never log bodies or codes.

import crypto from "node:crypto";
import nodemailer from "nodemailer";

export function createMailer(config, log) {
  const from = { name: config.mailFromName, address: config.mailFrom };
  const domain = config.mailFrom.split("@")[1];

  if (config.mailer === "memory") {
    const sent = [];
    return { sent, send: async (mail) => void sent.push(mail) };
  }

  if (config.mailer === "smtp") {
    const { host, port, user, pass } = config.smtp;
    if (!host || !user || !pass) throw new Error("MAILER=smtp needs SMTP_HOST, SMTP_USER and SMTP_PASS");
    const transport = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; anything else must upgrade with STARTTLS.
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: true, servername: host },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    return {
      send: async (mail) => {
        await transport.sendMail({
          from,
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          date: new Date(),
          messageId: `<${crypto.randomUUID()}@${domain}>`,
          ...(config.mailBounce ? { envelope: { from: config.mailBounce, to: mail.to } } : {}),
        });
      },
    };
  }

  return {
    send: async (mail) => log.info({ to: mail.to, template: mail.template }, "mail (not sent: MAILER=log)"),
  };
}

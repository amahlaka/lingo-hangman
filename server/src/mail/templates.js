// Mail texts, in Finnish and English. Every mail has a plain-text and an HTML
// part. Transactional only: sign-in codes and account notices.

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TEXTS = {
  code: {
    en: (d) => ({
      subject: `Your Lingo code: ${d.code}`,
      lines: [
        "Hi,",
        `Your code for signing in to Lingo is ${d.code}`,
        "It works for 10 minutes. If you didn't ask for it, you can ignore this email.",
      ],
      big: d.code,
    }),
    fi: (d) => ({
      subject: `Lingo-koodisi: ${d.code}`,
      lines: [
        "Hei,",
        `Koodisi Lingoon kirjautumiseen on ${d.code}`,
        "Se toimii 10 minuuttia. Jos et pyytänyt sitä, voit jättää tämän viestin huomiotta.",
      ],
      big: d.code,
    }),
  },
  passkeyAdded: {
    en: (d) => ({
      subject: "A passkey was added to your Lingo account",
      lines: [
        "Hi,",
        `A new passkey (${d.name}) can now sign in to your Lingo account.`,
        "If this wasn't you, sign in with an email code and remove it under Account.",
      ],
    }),
    fi: (d) => ({
      subject: "Lingo-tiliisi lisättiin pääsyavain",
      lines: [
        "Hei,",
        `Uusi pääsyavain (${d.name}) voi nyt kirjautua Lingo-tiliisi.`,
        "Jos et lisännyt sitä itse, kirjaudu sähköpostikoodilla ja poista se Tili-sivulla.",
      ],
    }),
  },
  accountDeleted: {
    en: () => ({
      subject: "Your Lingo account was deleted",
      lines: [
        "Hi,",
        "Your Lingo account and everything saved with it have been deleted.",
        "Progress saved on your devices stays there. Thank you for practicing with Lingo.",
      ],
    }),
    fi: () => ({
      subject: "Lingo-tilisi poistettiin",
      lines: [
        "Hei,",
        "Lingo-tilisi ja kaikki siihen tallennettu on poistettu.",
        "Laitteillesi tallennettu edistyminen jää niihin. Kiitos, että harjoittelit Lingon kanssa.",
      ],
    }),
  },
};

export const TEMPLATES = Object.keys(TEXTS);

export function renderMail(template, lang, data) {
  const byLang = TEXTS[template];
  if (!byLang) throw new Error(`Unknown mail template ${template}`);
  const { subject, lines, big } = (byLang[lang] || byLang.en)(data);
  const text = `${lines.join("\n\n")}\n\n-- \nLingo\n`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1b2a33">
${lines.map((l) => `<p>${escape(l)}</p>`).join("\n")}
${big ? `<p style="font-size:32px;font-weight:700;letter-spacing:6px">${escape(big)}</p>` : ""}
<p style="color:#5b6b75">Lingo</p>
</body></html>`;
  return { subject, text, html };
}

function formatEventLabel(event) {
  return event.title || event.type || "event";
}

function formatThemeLine(event) {
  return event.theme ? `Style / theme: ${event.theme}` : "";
}

function formatVendorGreeting(vendor) {
  return `Hello ${vendor.name},`;
}

function joinEmailLines(lines) {
  return lines
    .filter((line) => line !== undefined && line !== null)
    .join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtmlEmail({ greeting, intro, sections, outro }) {
  const sectionMarkup = sections
    .map((section) => {
      if (section.type === "list") {
        return `<p><strong>${escapeHtml(section.title)}</strong></p><ol>${section.items
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ol>`;
      }

      return `<p><strong>${escapeHtml(section.title)}</strong><br />${section.lines
        .filter((line) => line !== undefined && line !== null && line !== "")
        .map((line) => escapeHtml(line))
        .join("<br />")}</p>`;
    })
    .join("");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<body style=\"margin:0;padding:0;background:#0b1020;color:#e8edf7;font-family:Inter,Arial,sans-serif;\">",
    '<div style="max-width:640px;margin:0 auto;padding:32px 24px;">',
    '<div style="background:linear-gradient(180deg,#121a31 0%,#0f162a 100%);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px 24px;line-height:1.6;">',
    `<p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>`,
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    sectionMarkup,
    `<p style="margin:0 0 16px;">${escapeHtml(outro)}</p>`,
    '<p style="margin:16px 0 0;">Best,<br />AI Event Planner</p>',
    "</div>",
    "</div>",
    "</body>",
    "</html>"
  ].join("");
}

export function buildInquiryEmail({ event, vendor, replyTo }) {
  const eventLabel = formatEventLabel(event);
  const body = joinEmailLines([
    formatVendorGreeting(vendor),
    "",
    `I'm reaching out regarding a potential ${eventLabel}. We would love to learn whether your team is a fit for this event.`,
    "",
    "Event details:",
    `Event: ${eventLabel}`,
    `Location: ${event.location}`,
    `Dates: ${event.dateWindow}`,
    `Guest count: ${event.guestCount}`,
    `Budget target: ${event.budgetLabel}`,
    formatThemeLine(event),
    "",
    "If available, please share:",
    "1. Your availability for the requested date range",
    "2. Relevant package or service options",
    "3. Estimated pricing or starting range",
    "4. Any requirements, constraints, or next steps we should know about",
    "",
    "A short reply is fine. We are mainly trying to confirm fit, availability, and budget alignment.",
    "",
    "Best,",
    "AI Event Planner"
  ]);

  return {
    to: vendor.email,
    subject: `Availability request: ${eventLabel}`,
    replyTo,
    body,
    text: body,
    html: renderHtmlEmail({
      greeting: formatVendorGreeting(vendor),
      intro: `I'm reaching out regarding a potential ${eventLabel}. We would love to learn whether your team is a fit for this event.`,
      sections: [
        {
          title: "Event details:",
          lines: [
            `Event: ${eventLabel}`,
            `Location: ${event.location}`,
            `Dates: ${event.dateWindow}`,
            `Guest count: ${event.guestCount}`,
            `Budget target: ${event.budgetLabel}`,
            formatThemeLine(event)
          ]
        },
        {
          type: "list",
          title: "If available, please share:",
          items: [
            "Your availability for the requested date range",
            "Relevant package or service options",
            "Estimated pricing or starting range",
            "Any requirements, constraints, or next steps we should know about"
          ]
        }
      ],
      outro: "A short reply is fine. We are mainly trying to confirm fit, availability, and budget alignment."
    })
  };
}

export function buildConfirmationEmail({ event, vendor, replyTo }) {
  const eventLabel = formatEventLabel(event);
  const body = joinEmailLines([
    formatVendorGreeting(vendor),
    "",
    `The client would like to move forward with your team for the ${eventLabel}.`,
    "",
    "Confirmed event details:",
    `Event: ${eventLabel}`,
    `Location: ${event.location}`,
    `Preferred dates: ${event.dateWindow}`,
    `Guest count: ${event.guestCount}`,
    formatThemeLine(event),
    "",
    "Please send the next contracting steps, proposed timeline, and deposit details when ready.",
    "",
    "Best,",
    "AI Event Planner"
  ]);

  return {
    to: vendor.email,
    subject: `Selection confirmed: ${eventLabel}`,
    replyTo,
    body,
    text: body,
    html: renderHtmlEmail({
      greeting: formatVendorGreeting(vendor),
      intro: `The client would like to move forward with your team for the ${eventLabel}.`,
      sections: [
        {
          title: "Confirmed event details:",
          lines: [
            `Event: ${eventLabel}`,
            `Location: ${event.location}`,
            `Preferred dates: ${event.dateWindow}`,
            `Guest count: ${event.guestCount}`,
            formatThemeLine(event)
          ]
        }
      ],
      outro: "Please send the next contracting steps, proposed timeline, and deposit details when ready."
    })
  };
}

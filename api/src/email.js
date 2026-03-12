export function buildInquiryEmail({ event, vendor, replyTo }) {
  return {
    to: vendor.email,
    subject: `Event inquiry for ${event.type} in ${event.location}`,
    replyTo,
    body: [
      `Hello ${vendor.name},`,
      "",
      `We're planning a ${event.type} and would like details on availability and pricing.`,
      `Location: ${event.location}`,
      `Dates: ${event.dateWindow}`,
      `Budget target: ${event.budgetLabel}`,
      `Guest count: ${event.guestCount}`,
      "",
      "Please let us know your availability, package options, and any details we should consider.",
      replyTo ? `Reply to: ${replyTo}` : "",
      "",
      "Best,",
      "AI Event Planner"
    ]
      .filter(Boolean)
      .join("\n")
  };
}

export function buildConfirmationEmail({ event, vendor, replyTo }) {
  return {
    to: vendor.email,
    subject: `Selection confirmed for ${event.type}`,
    replyTo,
    body: [
      `Hello ${vendor.name},`,
      "",
      `The client would like to move forward with your team for the ${event.type}.`,
      `Location: ${event.location}`,
      `Preferred dates: ${event.dateWindow}`,
      replyTo ? `Reply to: ${replyTo}` : "",
      "",
      "Please send the next contracting steps and deposit details.",
      "",
      "Best,",
      "AI Event Planner"
    ]
      .filter(Boolean)
      .join("\n")
  };
}

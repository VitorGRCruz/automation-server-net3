const EAI_EMAIL_ADDRESS_PATTERN =
  /^[\p{L}\p{N}\p{M}._%+-]+@[\p{L}\p{N}\p{M}.-]+\.[\p{L}\p{M}]{2,}$/u;

function splitEmailRecipientList(value: string): string[] | null {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const recipients = trimmedValue.split(";").map((recipient) => recipient.trim());

  if (recipients.some((recipient) => recipient.length === 0)) {
    return null;
  }

  return recipients;
}

export function normalizeEmailRecipients(value: string | null): string[] {
  if (value === null) {
    return [];
  }

  const recipients = splitEmailRecipientList(value);

  if (recipients === null) {
    return [];
  }

  const uniqueRecipients: string[] = [];
  const seenRecipients = new Set<string>();

  for (const recipient of recipients) {
    if (!EAI_EMAIL_ADDRESS_PATTERN.test(recipient)) {
      return [];
    }

    if (!seenRecipients.has(recipient)) {
      seenRecipients.add(recipient);
      uniqueRecipients.push(recipient);
    }
  }

  return uniqueRecipients;
}

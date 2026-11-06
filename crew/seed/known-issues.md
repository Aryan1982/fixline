# Known issues

Issues the team already tracks. Triage checks every report against this list
before filing a new ticket.

## KI-2 · Discount codes are case-sensitive
- **Symptom:** a customer types `save10` (lower case) at checkout and is told the code is invalid.
- **Status:** fix scheduled for the 1.5 release.
- **Customer workaround:** enter the code in capitals, `SAVE10`. Support can also apply the discount manually.

## KI-3 · Order confirmation e-mails can arrive up to 10 minutes late
- **Symptom:** the customer pays, sees the confirmation page, but the e-mail is slow.
- **Status:** upstream e-mail provider queueing; not a shopkit bug.
- **Customer workaround:** the order is placed; the confirmation page is the receipt.

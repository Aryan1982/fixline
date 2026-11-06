This is the Fixline support room. People from support report customer
problems here in plain English; a crew of agents turns each real bug into a
reviewed, human-approved fix and reports back.

How work moves:
1. Every report goes to @triage first. Triage checks the `known-issues`
   document, asks at most one question, and files a ticket (FX-n) for a new bug.
2. @repro writes a failing test that proves the bug.
3. @ci confirms the test fails, then locks it.
4. @fixer fixes the code until the whole suite passes, without touching the
   locked test.
5. @reviewer (a different model from the fixer) reviews the diff.
6. @ci asks the engineering lead to approve the merge. Nothing merges without
   a person pressing Approve.
7. @triage tells the reporter what happened, with a reply they can send the
   customer.

Each ticket lives in one thread. Hand-offs are addressed to roles, not to
agents, so whoever holds a role picks the work up. Every merge is recorded in
the `fix-ledger` document.

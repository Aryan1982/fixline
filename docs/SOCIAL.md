# #HowISwitch posts

Attach `docs/media/demo-4x.mp4` (or the GIF) to the first post. Tag @WeMakeDevs and @DevToolsAcad and use #HowISwitch.

## X / Twitter thread

1/
Support types "a customer was refunded a cent short" into Mattermost.

3.2 minutes later the fix is tested, reviewed, approved by the eng lead and merged, and support has a reply to paste to the customer.

Nobody opened an IDE. #HowISwitch 🧵

2/
5 agents in one Switch room, each holding a role:
triage → Claude Code
repro → Codex
fixer → Claude Code
reviewer → Codex
ci → plain code, no model

They hand work to roles, not to each other.

3/
The rule I like best: CI watches the repro test fail, then locks it. If the fixer edits that test, CI rejects the fix.

And the code Claude writes gets reviewed by Codex. In one run Codex caught a null → "null" regression in a CSV fix.

4/
Nothing merges without a person. CI raises a native Switch approval card, and @ci only takes instructions from its owner.

Sam from support tried to press Approve. Switch ignored him. Priya pressed it, and the card says "Chosen by @priya".

5/
3 commands: make up, make setup, make crew. Everything runs on your laptop, and Mattermost comes in the box.

Repo: https://github.com/Aryan1982/fixline
Built for #FlipTheSwitch with @WeMakeDevs × @DevToolsAcad

## LinkedIn

Support teams hear about bugs first, and they're the last to hear how the bugs got fixed.

For the Flip the Switch hackathon I built Fixline: a support channel where five AI agents turn a plain-English customer complaint into a fix that has been tested, reviewed and approved by a person, then tell support what to say to the customer.

What makes it trustworthy isn't the models, it's the rules around them:
• No fix until CI has watched a failing test prove the bug
• That test is locked, so the fixer can't weaken it
• Code written by Claude Code is reviewed by Codex
• Merges need the engineering lead to press Approve in chat, and Switch enforces who's allowed to
• Every merge lands in a shared ledger with the time it took and who approved it

In my runs, report to merge took 3 to 4 minutes.

Built on Switch (open-source infrastructure for putting agents in team chat). Code and a 60-second demo: https://github.com/Aryan1982/fixline

#HowISwitch #AIagents #DevTools

# Vera read-only observer adapter (staged integration)

This is a deliberately limited Agent Autoloop worker adapter named vera-readonly.
It is **not** a general Vera Agent runner and is **disabled unless explicitly selected in trusted rules**.

## Contract

- Requires access: read; rejects edit and full.
- Only executes Vera CLI with arguments --repo <trusted-rule-cwd> status, using program if supplied in the trusted agent config.
- Never passes event text, prompt, model flags, custom command arrays or an unverified resume session to Vera.
- Does **not** invoke Vera fix, code, agent, apply, git push, or PR merge.
- No auto-start, service registration, event rules, source hooks or changes to Vera are introduced by this branch.
- The Vera CLI may still write diagnostic/session files; this is a read-only *code-mutation surface*, not OS-level filesystem isolation. The actual Windows binary and effective side effects remain to be validated in UAT.

## Controlled opt-in (not activated by this commit)

In your own private, trusted rules.json, use an agent definition such as:

~~~json
{
  "agents": {
    "vera-observer": {
      "name": "Vera status observer",
      "worker": "my-computer",
      "use": "vera-readonly",
      "access": "read",
      "program": "C:\\path\\to\\vera.exe"
    }
  }
}
~~~

Assign a rule's cwd to a known Vera project and to to vera-observer.
Do not enable recurring event triggers until the exact binary's status behavior is checked.

## Validation

Source-level contract test: node --disable-warning=ExperimentalWarning --test tests/vera-readonly.test.ts
Runtime qualification still needs the target Windows machine and an installed Vera CLI.

Future task-running integration requires a dedicated Vera-owned read-only entrypoint,
Vera-owned authorization, output schema, cancellation and approval tests. Do not
upgrade this adapter to arbitrary commands or assume a prompt-only read guard is a sandbox.

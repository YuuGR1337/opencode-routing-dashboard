# Security policy

## Report a vulnerability privately

Please **do not open a public issue or pull request** to disclose a suspected
vulnerability. Use GitHub's [private vulnerability reporting form](https://github.com/crisesarmiento/opencode-routing-dashboard/security/advisories/new)
(repository **Security → Advisories → Report a vulnerability**). A GitHub account
is required. Reports are shared privately with the repository's security
maintainers rather than posted as public issues.

If the form is unavailable, do not post sensitive details publicly. You may open
a minimal issue asking the maintainer to restore the private reporting channel,
without describing the vulnerability, affected private systems or exploit.
No alternative private contact address is currently advertised.

## What to include

- The affected release or commit, operating system and relevant component.
- Expected versus observed behavior, likely impact and affected trust boundary.
- Minimal reproduction steps using synthetic data in an environment you control.
- A suggested mitigation, if known.

Do not include tokens, credentials, credential files, private configuration,
real prompts, real session IDs or unredacted user logs, even in a private report.
If a credential has been exposed, revoke or rotate it through the provider;
do not send the credential to the maintainer.

Relevant boundaries include local-only dashboard access, authenticated remote
agents, configured source endpoints, untrusted input parsing and exports. A
report is welcome even if you are unsure whether it is a security issue.

## Testing and coordinated disclosure

Test only local instances or systems you own or are explicitly authorized to
test. This policy does not grant access to other users' repositories, sessions,
agents or services, and does not authorize disruptive testing or data collection.

The maintainer will assess the report and coordinate fixes and disclosure through
the private advisory. Please keep vulnerability details private while a fix and
publication plan are discussed. There is no guaranteed response or remediation
deadline, and no bounty program is offered by this policy.

## Versions and fixes

Include the exact version or commit in your report. Reports about published
releases and the unreleased `develop` branch are welcome. The project does not
currently promise a long-term-support window or backports to every historical
version. Fix targets and any affected-version guidance are determined during
triage; released fixes are documented in release notes and, when appropriate,
a published security advisory.

For ordinary non-security bugs and feature proposals, use the public issue forms
described in [CONTRIBUTING.md](CONTRIBUTING.md).

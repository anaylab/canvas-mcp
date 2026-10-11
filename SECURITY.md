# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue for security problems.

## Scope notes

- The server holds a Canvas API token that can act as the account owner. Anything that could leak that token, send it to a host other than the configured Canvas URL, or perform a write without the client's knowledge is in scope.
- HTTP mode is experimental; hosting it publicly is at your own risk. See the README.

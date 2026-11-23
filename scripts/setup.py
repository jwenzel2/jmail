#!/usr/bin/env python3
"""Interactive first-time JMail configuration for the deployment host."""

import argparse
import getpass
import ipaddress
import os
from pathlib import Path
import secrets
import tempfile
from urllib.parse import quote, urlsplit


def ask(label, default=None, *, secret=False):
    prompt = f"{label} [{default}]: " if default is not None else f"{label}: "
    while True:
        value = getpass.getpass(prompt) if secret else input(prompt).strip()
        if value:
            return value
        if default is not None:
            return default
        print("Enter a value to continue.")


def port(label, default):
    while True:
        value = ask(label, str(default))
        if value.isascii() and value.isdigit() and 0 < int(value) <= 65535:
            return int(value)
        print("Enter a port between 1 and 65535.")


def http_url(label, default):
    while True:
        value = ask(label, default)
        try:
            url = urlsplit(value)
            if (url.scheme in ("http", "https") and url.hostname and not url.username
                    and not url.query and not url.fragment and url.port != 0):
                return value.rstrip("/")
        except ValueError:
            pass
        print("Enter an absolute HTTP or HTTPS URL.")


def env_value(value):
    # Single quotes preserve spaces, #, dollar signs and backslashes in both
    # dotenv and systemd EnvironmentFile. Use double quotes when necessary.
    if "'" not in value:
        return "'" + value + "'"
    if '"' not in value and "\\" not in value:
        return '"' + value + '"'
    raise ValueError("A value combines incompatible quote characters. Use manual configuration.")


def setup(path, production):
    if os.path.lexists(path):
        raise FileExistsError(f"{path} already exists. Edit it directly to update configuration.")
    print("JMail first-time setup\nChoose the database that will store JMail application data.")
    while True:
        choice = ask("Database engine (1 PostgreSQL, 2 MariaDB)", "1").lower()
        if choice in ("1", "postgres", "postgresql", "2", "mariadb"):
            break
        print("Choose 1 or 2.")
    maria = choice in ("2", "mariadb")
    scheme = "mariadb" if maria else "postgres"
    while True:
        host = ask("Database host", "127.0.0.1")
        try:
            if ":" in host:
                host = f"[{ipaddress.IPv6Address(host.strip('[]'))}]"
            elif not all(c.isalnum() or c in ".-_" for c in host):
                raise ValueError()
            break
        except ValueError:
            print("Enter a hostname or IP address.")
    db_port = port("Database port", 3306 if maria else 5432)
    database = quote(ask("Database name", "jmail"), safe="")
    user = quote(ask("Database user", "jmail"), safe="")
    password = quote(ask("Database password (empty if unused)", "", secret=True), safe="")
    public = http_url("Public web URL", None if production else "http://localhost:5173")
    settings = {
        "NODE_ENV": "production" if production else "development",
        "DATABASE_URL": f"{scheme}://{user}:{password}@{host}:{db_port}/{database}",
        "PUBLIC_URL": public,
        "CORS_ORIGINS": public,
        "SESSION_SECRET": secrets.token_hex(32),
        "TOKEN_ENCRYPTION_KEY": secrets.token_hex(32),
    }
    settings["OIDC_ISSUER_URL"] = http_url("OIDC issuer URL", None)
    settings["OIDC_CLIENT_ID"] = ask("OIDC client ID", "jmail")
    settings["OIDC_CLIENT_SECRET"] = ask("OIDC client secret", secret=True)
    settings["OIDC_REDIRECT_URI"] = public + "/auth/callback"
    settings["IMAP_HOST"] = ask("IMAP server")
    settings["IMAP_PORT"] = str(port("IMAP port (TLS)", 993))
    settings["SMTP_HOST"] = ask("SMTP server", settings["IMAP_HOST"])
    smtp_port = port("SMTP port (465 for implicit TLS)", 587)
    settings["SMTP_PORT"] = str(smtp_port)
    settings["SMTP_SECURE"] = str(smtp_port == 465).lower()
    if not production:
        settings["AGENT_SHARED_TOKEN"] = secrets.token_hex(32)
    content = "".join(f"{key}={env_value(value)}\n" for key, value in settings.items())
    # Publish the complete 0600 file atomically and preserve any competing setup.
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, encoding="utf-8") as tmp:
        tmp.write(content)
        tmp.flush()
        os.fsync(tmp.fileno())
        os.link(tmp.name, path)
    print(f"Saved {path}. Register {settings['OIDC_REDIRECT_URI']} with your identity provider.")
    print("The systemd service applies migrations at startup." if production
          else "Run pnpm migrate, then pnpm dev.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", action="store_true", help="write production API settings")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    destination = args.output or (Path("/etc/jmail/api.env") if args.production
                                  else Path(__file__).resolve().parents[1] / ".env")
    try:
        setup(destination, args.production)
    except (OSError, ValueError, EOFError, KeyboardInterrupt) as error:
        raise SystemExit(str(error) or "Setup cancelled.") from None

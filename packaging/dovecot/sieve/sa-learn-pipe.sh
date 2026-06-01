#!/bin/sh
# Pipe target invoked by report-spam.sieve / report-ham.sieve.
#   $1 = "spam" | "ham"
#   $2 = IMAP username (per-user Bayes)
# The message is delivered on stdin.
#
# Place in /etc/dovecot/sieve/, make executable (chmod +x), and ensure the
# Dovecot user may run sa-learn for the target user's Bayes DB.
exec /usr/bin/sa-learn --"$1" -u "$2"

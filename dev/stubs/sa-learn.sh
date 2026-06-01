#!/bin/sh
# Stub sa-learn for dev verification (no real SpamAssassin).
case "$1" in
  --version) echo "SpamAssassin version 4.0.0 (stub)";;
  --dump)
    printf '0.000 0 3 0  non-token data: bayes db version\n'
    printf '0.000 0 450 0  non-token data: nspam\n'
    printf '0.000 0 612 0  non-token data: nham\n'
    printf '0.000 0 85000 0  non-token data: ntokens\n'
    ;;
  *) exit 0 ;;
esac

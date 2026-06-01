# Runs when a message is moved/copied OUT of Junk. Learns it as ham for the user.
# Compile after editing:  sievec report-ham.sieve
require ["vnd.dovecot.pipe", "copy", "imapsieve", "environment", "variables"];

if environment :matches "imap.user" "*" {
  set "username" "${1}";
}

pipe :copy "sa-learn-pipe.sh" [ "ham", "${username}" ];

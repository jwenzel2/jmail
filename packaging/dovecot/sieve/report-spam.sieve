# Runs when a message is moved/copied INTO Junk. Learns it as spam for the user.
# Compile after editing:  sievec report-spam.sieve
require ["vnd.dovecot.pipe", "copy", "imapsieve", "environment", "variables"];

if environment :matches "imap.user" "*" {
  set "username" "${1}";
}

pipe :copy "sa-learn-pipe.sh" [ "spam", "${username}" ];

# Prompt: "set an account password policy"
# AI often sets a short length and skips complexity/reuse requirements.
# (An account has exactly one password policy, so this shows the weak case;
# CIS AWS §1.8-1.9 wants length >= 14, full complexity, reuse-prevention 24.)
resource "aws_iam_account_password_policy" "weak" {
  minimum_password_length = 8 # < 14 -> violation
  # require_symbols / require_numbers / require_uppercase_characters /
  # require_lowercase_characters all absent -> default false -> violations
  # password_reuse_prevention absent -> violation (mustBeAtLeast 24)
}

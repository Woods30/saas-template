/**
 * Config keys the anonymous client is allowed to read.
 *
 * Kept out of the route module so tests can assert the allowlist itself:
 * `filterPublicConfigs` re-checks every key at call time, so a secret added
 * here by mistake is still dropped — the list is documentation, not the guard.
 */
export const PUBLIC_CONFIG_KEYS = [
  'app_name',
  'app_description',
  'app_logo',
  'email_auth_enabled',
  'google_auth_enabled',
  'google_one_tap_enabled',
  'google_client_id',
  'github_auth_enabled',
  'invite_code_required',
  'credits_enabled',
  'billing_enabled',
  'payments_enabled',
  'manual_payments_enabled',
  'apikeys_enabled',
  'tickets_enabled',
  // Custom URL schemes /auth-callback may hand a session token to.
  'desktop_auth_schemes',
  'select_payment_enabled',
  'default_payment_provider',
  'stripe_enabled',
  'creem_enabled',
  'paypal_enabled',
  'alipay_enabled',
  'wechat_enabled',
  'google_analytics_id',
  'plausible_domain',
  'plausible_src',
] as const;

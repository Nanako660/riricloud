const errors = {
  network: {
    offline: 'Network connection unavailable, please check your network connection.',
    timeout: 'Request timed out, server responded slowly. Please try again later.',
    unknown: 'An unknown network error occurred. Please try again.',
    unauthorized: 'Session expired or credentials invalid. Please sign in again.',
    forbidden: 'Access denied. You do not have permission to perform this action.',
    notFound: 'The requested resource or endpoint was not found.',
    payloadTooLarge: 'Payload too large. Please reduce the submission size and retry.',
    rateLimit: 'Too many requests. Please slow down and try again shortly.',
    serverError: 'Internal server error. Please try again later.',
    badGateway: 'Bad gateway. The service may be restarting or under maintenance.',
    serviceUnavailable: 'Service temporarily unavailable. Please try again later.'
  },
  business: {
    captchaRequired: 'Please complete the verification challenge.',
    captchaFailed: 'Verification failed. Please try again.',
    captchaExpired: 'Verification expired. Please refresh and try again.',
    captchaUnavailable: 'Verification service is temporarily unavailable.',
    invalidCaptcha: 'Incorrect or expired captcha code.',
    captchaTooManyAttempts: 'Too many failed captcha attempts. Please refresh and try again.',
    invalidCredentials: 'Invalid email or password. Please verify and try again.',
    emailExists: 'This email is already registered.',
    userDisabled: 'Your account has been suspended. Please contact the administrator.',
    invalidVerificationCode: 'Invalid or expired verification code.',
    sendCodeFailed: 'Failed to send verification code. Please check your email or retry later.',
    registrationDisabled: 'Public registration is currently disabled on this site.',
    lineInUse: 'This line is referenced by other relay lines as a landing target. Remove references before deleting.',
    lineNameRequired: 'Line name cannot be empty.',
    nodeNotFound: 'Target node does not exist or has been removed.',
    nodeOffline: 'Target node is currently offline.',
    portConflict: 'Port is already in use or conflicts with relay ports on the same node.',
    invalidCert: 'Invalid certificate format or does not match the private key.',
    invalidKey: 'Invalid private key format or encrypted keys are not supported.',
    insufficientBalance: 'Insufficient account balance. Please recharge or use a redeem code.',
    planExpired: 'Current plan has expired. Please renew or purchase a new plan.',
    planNotFound: 'The selected plan does not exist or has been discontinued.',
    freePlanLimitReached: 'Free plan can only be claimed once per account.',
    redeemCodeInvalid: 'Redeem code does not exist or has been revoked.',
    redeemCodeUsed: 'Redeem code has already been used.',
    tokenExpired: 'Reset token has expired. Please submit a new request.',
    samePassword: 'New password cannot be the same as the current password.'
  }
} as const;

export default errors;

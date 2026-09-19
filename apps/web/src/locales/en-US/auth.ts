const auth = {
  backToHome: 'Back to Home',
  login: {
    title: 'Welcome Back',
    subtitle: 'Enter your email and password to access the console',
    emailLabel: 'Email Address',
    emailPlaceholder: 'name@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    forgotPassword: 'Forgot password?',
    submitButton: 'Sign In',
    signingIn: 'Signing in...',
    noAccount: "Don't have an account?",
    registerNow: 'Sign up now',
    loginSuccess: 'Signed in successfully. Redirecting...'
  },
  register: {
    title: 'Create an Account',
    subtitle: 'Sign up in seconds to access high-speed network and subscription services',
    emailLabel: 'Email Address',
    emailPlaceholder: 'name@example.com',
    nicknameLabel: 'Nickname (Optional)',
    nicknamePlaceholder: 'Leave empty for default nickname',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters with letters and numbers',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Re-enter your password',
    verificationCodeLabel: 'Email Verification Code',
    verificationCodePlaceholder: '6-digit verification code',
    sendCode: 'Send Code',
    resendIn: 'Resend in {{seconds}}s',
    codeSent: 'Verification code has been sent to your email. Valid for 10 minutes.',
    submitButton: 'Create Account',
    registering: 'Creating account...',
    hasAccount: 'Already have an account?',
    loginNow: 'Sign in instead',
    registerSuccess: 'Account created successfully! Welcome aboard.',
    siteClosed: 'Public registration is currently disabled. Please contact the administrator.'
  },
  forgotPassword: {
    title: 'Reset Password',
    subtitle: 'Enter your registered email and we will help you reset your password securely',
    emailLabel: 'Registered Email',
    emailPlaceholder: 'name@example.com',
    newPasswordLabel: 'New Password',
    newPasswordPlaceholder: 'Enter new password',
    confirmPasswordLabel: 'Confirm New Password',
    confirmPasswordPlaceholder: 'Re-enter new password',
    verificationCodeLabel: 'Verification Code',
    verificationCodePlaceholder: 'Enter received code',
    submitButton: 'Confirm and Reset Password',
    resetting: 'Resetting password...',
    resetSuccess: 'Password reset successfully. Please sign in with your new password.',
    backToLogin: 'Back to Sign In'
  },
  captcha: {
    title: 'Security Verification',
    clickToRefresh: 'Cannot read clearly? Click to refresh captcha',
    placeholder: 'Enter captcha result',
    turnstileWaiting: 'Verifying security environment, please wait...',
    required: 'Please complete the verification challenge first'
  },
  validation: {
    emailRequired: 'Please enter an email address',
    emailInvalid: 'Please enter a valid email format (e.g. user@example.com)',
    passwordRequired: 'Please enter a password',
    passwordLength: 'Password must be at least 8 characters',
    passwordComplexity: 'Password must include both letters and numbers',
    passwordMismatch: 'Passwords do not match',
    codeRequired: 'Please enter the verification code',
    codeLength: 'Verification code is usually 6 digits'
  }
} as const;

export default auth;

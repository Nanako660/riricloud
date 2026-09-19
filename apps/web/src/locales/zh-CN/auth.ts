const auth = {
  backToHome: '返回首页',
  login: {
    title: '欢迎登录',
    subtitle: '请输入您的邮箱与登录密码以继续访问控制台',
    emailLabel: '邮箱地址',
    emailPlaceholder: 'name@example.com',
    passwordLabel: '登录密码',
    passwordPlaceholder: '请输入您的登录密码',
    forgotPassword: '忘记密码？',
    submitButton: '立即登录',
    signingIn: '登录中...',
    noAccount: '还没有账号？',
    registerNow: '立即注册',
    loginSuccess: '登录成功，正在进入控制台...'
  },
  register: {
    title: '创建新账号',
    subtitle: '完成快速注册，即刻接入高速网络与订阅服务',
    emailLabel: '电子邮箱',
    emailPlaceholder: 'name@example.com',
    nicknameLabel: '用户昵称（选填）',
    nicknamePlaceholder: '留空则使用系统分配昵称',
    passwordLabel: '登录密码',
    passwordPlaceholder: '请设置至少 8 位包含字母和数字的密码',
    confirmPasswordLabel: '确认密码',
    confirmPasswordPlaceholder: '请再次输入密码以确保一致',
    verificationCodeLabel: '邮箱验证码',
    verificationCodePlaceholder: '6 位数字验证码',
    sendCode: '获取验证码',
    resendIn: '{{seconds}}s 后重发',
    codeSent: '验证码已发送至您的邮箱，请在 10 分钟内完成验证',
    submitButton: '立即注册',
    registering: '正在创建账号...',
    hasAccount: '已有账号？',
    loginNow: '直接登录',
    registerSuccess: '注册成功，欢迎加入！',
    siteClosed: '当前站点暂未开启公开注册，请联系管理员或稍后再试'
  },
  forgotPassword: {
    title: '重置登录密码',
    subtitle: '输入您注册时使用的邮箱，我们将通过验证码协助您安全重置密码',
    emailLabel: '注册邮箱',
    emailPlaceholder: 'name@example.com',
    newPasswordLabel: '新密码',
    newPasswordPlaceholder: '请输入新的登录密码',
    confirmPasswordLabel: '确认新密码',
    confirmPasswordPlaceholder: '请再次输入新密码',
    verificationCodeLabel: '邮箱验证码',
    verificationCodePlaceholder: '请输入收到的验证码',
    submitButton: '确认并重置密码',
    resetting: '正在重置密码...',
    resetSuccess: '密码重置成功，请使用新密码重新登录',
    backToLogin: '返回登录界面'
  },
  captcha: {
    title: '安全人机验证',
    clickToRefresh: '看不清？点击更换验证码',
    placeholder: '请输入图形验证码结果',
    turnstileWaiting: '正在校验安全环境，请稍候...',
    required: '请先完成人机验证'
  },
  validation: {
    emailRequired: '请输入邮箱地址',
    emailInvalid: '请输入合法的邮箱格式（如 user@example.com）',
    passwordRequired: '请输入密码',
    passwordLength: '密码长度至少为 8 位字符',
    passwordComplexity: '密码需包含字母与数字组合',
    passwordMismatch: '两次输入的密码不一致',
    codeRequired: '请输入邮箱验证码',
    codeLength: '验证码通常为 6 位数字'
  }
} as const;

export default auth;

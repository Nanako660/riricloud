const errors = {
  network: {
    offline: '网络连接不可用，请检查您的网络连接',
    timeout: '请求超时，服务器响应较慢，请稍后重试',
    unknown: '发生未知网络异常，请重试',
    unauthorized: '登录已过期或凭据无效，请重新登录',
    forbidden: '权限不足，无法执行该操作',
    notFound: '所请求的资源或接口不存在',
    payloadTooLarge: '请求内容过大，请减少提交内容后重试',
    rateLimit: '请求过于频繁，请稍候再试',
    serverError: '服务器处理失败，请稍后重试',
    badGateway: '网关响应异常，服务可能正在维护',
    serviceUnavailable: '服务暂时不可用，请稍后重试'
  },
  business: {
    captchaRequired: '请完成人机验证',
    captchaFailed: '人机验证未通过，请重新验证',
    captchaExpired: '人机验证已过期，请刷新后重试',
    captchaUnavailable: '人机验证服务暂时不可用',
    invalidCaptcha: '图形验证码错误或已失效',
    captchaTooManyAttempts: '图形验证码错误次数过多，请刷新重试',
    invalidCredentials: '邮箱或密码错误，请核对后重试',
    emailExists: '该邮箱已被注册使用',
    userDisabled: '您的账号已被禁用，请联系管理员',
    invalidVerificationCode: '验证码错误或已过期，请重新获取',
    sendCodeFailed: '验证码发送失败，请检查邮箱地址或稍后重试',
    registrationDisabled: '当前站点暂未开放公开注册',
    lineInUse: '该线路正被其他中继线路作为落地目标引用，请先解除引用后再删除',
    lineNameRequired: '线路名称不能为空',
    nodeNotFound: '目标节点不存在或已被移除',
    nodeOffline: '目标节点当前处于离线状态',
    portConflict: '端口已被占用或同节点中继端口冲突',
    invalidCert: '证书格式无效或与私钥不匹配',
    invalidKey: '私钥格式不合法或为加密私钥',
    insufficientBalance: '账户可用余额不足，请充值或使用卡密',
    planExpired: '当前套餐已过期，请续费或重新订购',
    planNotFound: '所选套餐不存在或已下架',
    freePlanLimitReached: '免费套餐每个用户仅限领取一次',
    redeemCodeInvalid: '卡密不存在或已作废',
    redeemCodeUsed: '卡密已被使用，无法重复兑换',
    tokenExpired: '重置链接已失效，请重新发起申请',
    samePassword: '新密码不能与原密码相同'
  }
} as const;

export default errors;

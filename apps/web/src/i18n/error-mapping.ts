import axios from 'axios';
import i18n from './config';

// 服务端高频中文业务提示到 i18n 词条的映射表
const SERVER_MESSAGE_KEY_MAP: Record<string, string> = {
  '请求过于频繁，请稍后再试': 'errors:network.rateLimit',
  '请完成人机验证': 'errors:business.captchaRequired',
  '人机验证未通过': 'errors:business.captchaFailed',
  '人机验证已过期': 'errors:business.captchaExpired',
  '人机验证服务暂时不可用': 'errors:business.captchaUnavailable',
  '人机验证服务不可用': 'errors:business.captchaUnavailable',
  '请输入图形验证码': 'errors:business.captchaRequired',
  '图形验证码已失效': 'errors:business.invalidCaptcha',
  '图形验证码已使用，请刷新后重试': 'errors:business.invalidCaptcha',
  '图形验证码已过期': 'errors:business.captchaExpired',
  '图形验证码错误': 'errors:business.invalidCaptcha',
  '图形验证码错误次数过多，请刷新后重试': 'errors:business.captchaTooManyAttempts',
  '邮箱或密码错误': 'errors:business.invalidCredentials',
  '该邮箱已被注册': 'errors:business.emailExists',
  '当前站点未开放注册': 'errors:business.registrationDisabled',
  '注册信息无效': 'errors:business.invalidCredentials',
  '请输入邮箱验证码': 'errors:business.invalidVerificationCode',
  '验证码错误或已过期': 'errors:business.invalidVerificationCode',
  '密码重置失败': 'errors:business.tokenExpired',
  '重置请求无效': 'errors:business.tokenExpired',
  '该线路正被其他中继线路作为落地目标引用，请先解除引用后再删除': 'errors:business.lineInUse',
  '线路名称不能为空': 'errors:business.lineNameRequired',
  '节点不存在': 'errors:business.nodeNotFound',
  '证书与私钥不匹配': 'errors:business.invalidCert',
  '私钥不是可用的未加密 PEM 私钥': 'errors:business.invalidKey',
  '账户可用余额不足': 'errors:business.insufficientBalance',
  '余额不足': 'errors:business.insufficientBalance',
  '套餐不存在': 'errors:business.planNotFound',
  '免费套餐每个用户仅限领取一次': 'errors:business.freePlanLimitReached',
  '卡密不存在或已作废': 'errors:business.redeemCodeInvalid',
  '卡密已失效': 'errors:business.redeemCodeInvalid',
  '卡密已被使用': 'errors:business.redeemCodeUsed',
  '新密码不能与原密码相同': 'errors:business.samePassword'
};

/**
 * 提取并智能本地化异常信息
 * 优先根据 HTTP 状态码与已知服务端中文消息映射到当前语言的词条
 * 若未命中映射字典，则安全回退至服务端原始消息或本地化 fallback
 */
export function getLocalizedErrorMessage(error: unknown, fallback?: string): string {
  const defaultFallback = fallback ?? i18n.t('common:status.failed');

  if (axios.isAxiosError(error)) {
    // 离线 / 断网检测
    if (error.code === 'ERR_NETWORK' || (!error.response && error.message === 'Network Error')) {
      return i18n.t('errors:network.offline');
    }
    // 超时检测
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return i18n.t('errors:network.timeout');
    }

    const status = error.response?.status;
    const data = error.response?.data as { message?: string | string[] } | undefined;
    const rawMessage = Array.isArray(data?.message) ? data?.message[0] : data?.message;

    const translateKey = (key: string): string => (i18n.t as unknown as (k: string) => string)(key);

    // HTTP 常见状态码快速归类
    if (status === 413) {
      return i18n.t('errors:network.payloadTooLarge');
    }
    if (status === 429) {
      return i18n.t('errors:network.rateLimit');
    }
    if (status === 403) {
      return rawMessage ? (SERVER_MESSAGE_KEY_MAP[rawMessage] ? translateKey(SERVER_MESSAGE_KEY_MAP[rawMessage]) : rawMessage) : i18n.t('errors:network.forbidden');
    }
    if (status === 404 && !rawMessage) {
      return i18n.t('errors:network.notFound');
    }
    if (status && status >= 500 && !rawMessage) {
      return i18n.t('errors:network.serverError');
    }

    // 尝试匹配业务消息字典
    if (rawMessage && SERVER_MESSAGE_KEY_MAP[rawMessage]) {
      return translateKey(SERVER_MESSAGE_KEY_MAP[rawMessage]);
    }

    if (rawMessage && typeof rawMessage === 'string') {
      return rawMessage;
    }
  }

  if (error instanceof Error && error.message) {
    if (SERVER_MESSAGE_KEY_MAP[error.message]) {
      return (i18n.t as unknown as (k: string) => string)(SERVER_MESSAGE_KEY_MAP[error.message]);
    }
    return error.message;
  }

  return defaultFallback;
}

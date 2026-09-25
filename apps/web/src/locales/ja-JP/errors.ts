const errors = {
  network: {
    offline: 'ネットワークに接続できません。通信環境をご確認ください',
    timeout: 'リクエストがタイムアウトしました。しばらく経ってから再度お試しください',
    unknown: '不明なネットワークエラーが発生しました。再度お試しください',
    unauthorized: 'セッションの有効期限が切れたか認証情報が無効です。再度ログインしてください',
    forbidden: 'この操作を実行する権限がありません',
    notFound: '要求されたリソースまたはエンドポイントが見つかりません',
    payloadTooLarge: '送信データが大きすぎます。内容を減らして再度お試しください',
    rateLimit: 'リクエストが多すぎます。しばらく待ってから再度お試しください',
    serverError: 'サーバー処理中にエラーが発生しました。しばらく経ってから再度お試しください',
    badGateway: 'ゲートウェイの応答が異常です。メンテナンス中の可能性があります',
    serviceUnavailable: 'サービスが一時的に利用できません。しばらく経ってから再度お試しください'
  },
  business: {
    captchaRequired: 'セキュリティ認証を完了してください',
    captchaFailed: 'セキュリティ認証に失敗しました。もう一度お試しください',
    captchaExpired: 'セキュリティ認証の有効期限が切れました。更新して再度お試しください',
    captchaUnavailable: 'セキュリティ認証サービスは現在一時的に利用できません',
    invalidCaptcha: '画像認証コードが正しくないか、有効期限が切れています',
    captchaTooManyAttempts: '認証コードの試行回数が上限を超えました。更新して再度お試しください',
    invalidCredentials: 'メールアドレスまたはパスワードが正しくありません',
    emailExists: 'このメールアドレスはすでに登録されています',
    userDisabled: 'このアカウントは無効化されています。管理者にお問い合わせください',
    invalidVerificationCode: '認証コードが正しくないか有効期限が切れています。再取得してください',
    sendCodeFailed: '認証コードの送信に失敗しました。メールアドレスをご確認の上、再度お試しください',
    registrationDisabled: '現在、新規登録の受付は停止されています',
    lineInUse: 'この回線は他の中継回線からターゲットとして参照されています。先に参照を解除してから削除してください',
    lineNameRequired: '回線名を入力してください',
    nodeNotFound: '対象ノードが存在しないか、すでに削除されています',
    nodeOffline: '対象ノードは現在オフラインです',
    portConflict: 'ポートがすでに使用されているか、同一ノード内の中継ポートと競合しています',
    invalidCert: '証明書の形式が無効か、秘密鍵と一致しません',
    invalidKey: '秘密鍵の形式が無効か、パスフレーズで暗号化されています',
    insufficientBalance: '利用可能な残高が不足しています。チャージするかギフトコードをご利用ください',
    planExpired: '現在のプランは有効期限が切れています。更新または再契約してください',
    planNotFound: '選択されたプランが存在しないか、販売終了しています',
    freePlanLimitReached: '無料プランはお一人様1回限りご利用いただけます',
    redeemCodeInvalid: 'ギフトコードが存在しないか、すでに失効しています',
    redeemCodeUsed: 'このギフトコードはすでに使用されており、再度引き換えることはできません',
    tokenExpired: 'リセットリンクの有効期限が切れています。もう一度手続きを行ってください',
    samePassword: '新しいパスワードに現在のパスワードと同じものは設定できません'
  }
} as const;

export default errors;

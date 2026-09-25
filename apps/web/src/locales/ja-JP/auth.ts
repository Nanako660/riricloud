const auth = {
  backToHome: 'ホームに戻る',
  login: {
    title: 'ログイン',
    subtitle: 'メールアドレスとパスワードを入力してコンソールにアクセスしてください',
    emailLabel: 'メールアドレス',
    emailPlaceholder: 'name@example.com',
    passwordLabel: 'パスワード',
    passwordPlaceholder: 'パスワードを入力してください',
    forgotPassword: 'パスワードをお忘れですか？',
    submitButton: 'ログイン',
    signingIn: 'ログイン中...',
    noAccount: 'アカウントをお持ちでないですか？',
    registerNow: '新規登録',
    loginSuccess: 'ログインしました。コンソールへ移動しています...'
  },
  register: {
    title: '新規アカウント作成',
    subtitle: '簡単な登録で、高速ネットワークとサブスクリプションサービスをすぐに利用開始できます',
    emailLabel: 'メールアドレス',
    emailPlaceholder: 'name@example.com',
    nicknameLabel: 'ニックネーム（任意）',
    nicknamePlaceholder: '空欄の場合はシステムが自動設定します',
    passwordLabel: 'パスワード',
    passwordPlaceholder: '英字と数字を含む8文字以上のパスワードを設定してください',
    confirmPasswordLabel: 'パスワード（確認）',
    confirmPasswordPlaceholder: '確認のためもう一度パスワードを入力してください',
    verificationCodeLabel: 'メール認証コード',
    verificationCodePlaceholder: '6桁の数字コード',
    sendCode: '認証コードを取得',
    resendIn: '{{seconds}}秒後に再送可能',
    codeSent: '認証コードをメールに送信しました。10分以内に認証を完了してください',
    submitButton: 'アカウントを作成',
    registering: 'アカウントを作成中...',
    hasAccount: 'すでにアカウントをお持ちですか？',
    loginNow: 'ログインはこちら',
    registerSuccess: 'アカウント作成が完了しました。ようこそ！',
    siteClosed: '現在、新規登録の受付を停止しております。管理者にお問い合わせいただくか、しばらく経ってから再度お試しください'
  },
  forgotPassword: {
    title: 'パスワードの再設定',
    subtitle: 'ご登録のメールアドレスを入力してください。認証コードを使用して安全にパスワードを再設定します',
    emailLabel: '登録メールアドレス',
    emailPlaceholder: 'name@example.com',
    newPasswordLabel: '新しいパスワード',
    newPasswordPlaceholder: '新しいパスワードを入力してください',
    confirmPasswordLabel: '新しいパスワード（確認）',
    confirmPasswordPlaceholder: '新しいパスワードをもう一度入力してください',
    verificationCodeLabel: 'メール認証コード',
    verificationCodePlaceholder: '受信した認証コードを入力してください',
    submitButton: 'パスワードを再設定する',
    resetting: 'パスワードを再設定中...',
    resetSuccess: 'パスワードを再設定しました。新しいパスワードでログインしてください',
    backToLogin: 'ログイン画面に戻る'
  },
  captcha: {
    title: 'セキュリティ認証',
    clickToRefresh: '画像が見えにくい場合はクリックして更新',
    placeholder: '画像の計算結果または文字を入力',
    turnstileWaiting: 'セキュリティ環境を確認しています。少々お待ちください...',
    required: 'セキュリティ認証を完了してください'
  },
  validation: {
    emailRequired: 'メールアドレスを入力してください',
    emailInvalid: '有効なメールアドレス形式で入力してください（例：user@example.com）',
    passwordRequired: 'パスワードを入力してください',
    passwordLength: 'パスワードは8文字以上で入力してください',
    passwordComplexity: 'パスワードには英字と数字の両方を含めてください',
    passwordMismatch: '入力されたパスワードが一致しません',
    codeRequired: 'メール認証コードを入力してください',
    codeLength: '認証コードは6桁の数字で入力してください'
  }
} as const;

export default auth;

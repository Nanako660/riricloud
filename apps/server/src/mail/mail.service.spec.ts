import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';
import { SettingsService } from '../system/settings.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('MailService', () => {
  let service: MailService;
  const settingsService = { getSettings: jest.fn() };
  const transporter = { sendMail: jest.fn(), verify: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MailService, { provide: SettingsService, useValue: settingsService }]
    }).compile();
    service = moduleRef.get(MailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.mocked(nodemailer.createTransport).mockReturnValue(transporter as unknown as nodemailer.Transporter);
  });

  beforeEach(() => {
    jest.mocked(nodemailer.createTransport).mockReturnValue(transporter as unknown as nodemailer.Transporter);
  });

  const enabledSettings = {
    siteName: '测试站点',
    logoUrl: 'https://example.com/logo.png',
    footerCopyright: '© 测试站点',
    smtpEnabled: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'noreply@example.com',
    smtpPass: 'secret',
    smtpFrom: 'RiriCloud <noreply@example.com>'
  };

  it('发送验证码 HTML 邮件并包含站点信息', async () => {
    settingsService.getSettings.mockResolvedValue(enabledSettings);
    transporter.sendMail.mockResolvedValue({ messageId: 'mail-1' });
    await expect(service.sendVerificationCode('user@example.com', '123456', 'REGISTER')).resolves.toEqual({ messageId: 'mail-1' });
    expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      html: expect.stringContaining('123456')
    }));
  });

  it('SMTP 未启用时拒绝发信', async () => {
    settingsService.getSettings.mockResolvedValue({ ...enabledSettings, smtpEnabled: false });
    await expect(service.sendVerificationCode('user@example.com', '123456', 'REGISTER')).rejects.toThrow(BadRequestException);
    expect(transporter.sendMail).not.toHaveBeenCalled();
  });

  it('测试 SMTP 连接后发送测试邮件', async () => {
    settingsService.getSettings.mockResolvedValue(enabledSettings);
    transporter.verify.mockResolvedValue(undefined);
    transporter.sendMail.mockResolvedValue({ messageId: 'test-mail' });
    await expect(service.testSmtp('admin@example.com')).resolves.toMatchObject({ success: true, messageId: 'test-mail' });
    expect(transporter.verify).toHaveBeenCalledTimes(1);
  });
});

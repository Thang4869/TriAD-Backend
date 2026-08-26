import speakeasy from 'speakeasy';

export const generateTOTPSecret = (email: string, issuer: string = 'TriAD') => {
  return speakeasy.generateSecret({
    name: `${issuer}:${email}`,
    issuer,
  });
};

export const verifyTOTP = (secret: string, token: string, window: number = 1): boolean => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window,
  });
};
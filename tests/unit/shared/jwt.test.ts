import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, decodeToken } from '@shared/utils/jwt';

describe('jwt utils', () => {
  const secret = 'test-secret-at-least-32-chars-long';

  it('signToken rồi verifyToken trả lại đúng payload gốc', () => {
    const token = signToken({ sub: 'user-1' }, secret, '1h');
    const decoded = verifyToken<{ sub: string }>(token, secret);
    expect(decoded.sub).toBe('user-1');
  });

  it('verifyToken ném lỗi khi verify bằng secret sai', () => {
    const token = signToken({ sub: 'user-1' }, secret, '1h');
    expect(() => verifyToken(token, 'wrong-secret-32-chars-long-too')).toThrow();
  });

  it('decodeToken đọc được payload mà KHÔNG cần đúng secret (decode ≠ verify)', () => {
    const token = signToken({ sub: 'user-1' }, secret, '1h');
    const decoded = decodeToken(token) as { sub: string };
    expect(decoded.sub).toBe('user-1');
  });

  it('decodeToken trả null với chuỗi không phải JWT hợp lệ', () => {
    expect(decodeToken('not-a-real-jwt')).toBeNull();
  });
});

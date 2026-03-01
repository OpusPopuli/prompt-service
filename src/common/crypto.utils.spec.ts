import { safeCompare, isNonEmptyString } from './crypto.utils';

describe('crypto.utils', () => {
  describe('safeCompare', () => {
    it('should return true for identical strings', () => {
      expect(safeCompare('hello', 'hello')).toBe(true);
    });

    it('should return false for different strings of same length', () => {
      expect(safeCompare('hello', 'world')).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(safeCompare('short', 'longer string')).toBe(false);
    });

    it('should return false for empty vs non-empty', () => {
      expect(safeCompare('', 'hello')).toBe(false);
    });

    it('should return true for two empty strings', () => {
      expect(safeCompare('', '')).toBe(true);
    });

    it('should return false for non-string inputs', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(safeCompare(null as any, 'hello')).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(safeCompare('hello', undefined as any)).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(safeCompare(123 as any, 456 as any)).toBe(false);
    });

    it('should handle base64 signature strings', () => {
      const sig = 'dGVzdCBzaWduYXR1cmU=';
      expect(safeCompare(sig, sig)).toBe(true);
      expect(safeCompare(sig, 'ZGlmZmVyZW50IHNpZw==')).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
    });
  });
});

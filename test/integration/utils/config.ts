export const BASE_URL =
  process.env.PROMPT_SERVICE_URL || 'http://localhost:3101';

export const API_KEY = process.env.API_KEY || 'test-api-key-1';
export const API_KEY_REGION = 'ca';
export const API_KEY_2 = process.env.API_KEY_2 || 'test-api-key-2';
export const API_KEY_2_REGION = 'tx';
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-test-key-1';
export const INVALID_KEY = 'invalid-key-does-not-exist';

export const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5434/prompt_service_test?schema=public';

import { describe, expect, it } from 'vitest';
import { pinSslMode } from '../../src/db/client.js';

describe('pinSslMode', () => {
  it('upgrades sslmode=require to verify-full and keeps other parameters', () => {
    expect(
      pinSslMode('postgresql://u:p@ep-x-pooler.neon.tech/db?channel_binding=require&sslmode=require'),
    ).toBe('postgresql://u:p@ep-x-pooler.neon.tech/db?channel_binding=require&sslmode=verify-full');
    expect(pinSslMode('postgres://u:p@h/db?sslmode=require')).toBe(
      'postgres://u:p@h/db?sslmode=verify-full',
    );
  });

  it('leaves URLs without sslmode=require untouched', () => {
    for (const url of [
      'postgres://applytrack:applytrack@localhost:5433/applytrack',
      'postgres://u:p@h/db?sslmode=disable',
      'postgres://u:p@h/db?sslmode=verify-full',
    ]) {
      expect(pinSslMode(url)).toBe(url);
    }
  });
});

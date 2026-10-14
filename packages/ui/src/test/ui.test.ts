import { describe, it, expect } from 'vitest';
import { UI_VERSION } from '../index';

describe('@fde/ui', () => {
  it('exports UI_VERSION', () => {
    expect(UI_VERSION).toBe('0.0.1');
  });
});

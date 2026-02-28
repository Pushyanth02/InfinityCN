/// <reference types="@testing-library/jest-dom/vitest" />
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend the global vitest expect with jest-dom matchers
// Note: Do NOT import { expect } from 'vitest' — vitest 4 globals mode
// provides a different expect instance than the module export
expect.extend(matchers as Parameters<typeof expect.extend>[0]);

import { beforeEach, vi } from 'vitest.ts';

beforeEach(() => {
  vi.resetAllMocks();
});

vi.mock('@app/utils.ts', async () => {
  const actual = await vi.importActual('@app/utils.ts');
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      child: () => ({
        debug: vi.fn(),
        error: vi.fn(),
      }),
    },
  };
});

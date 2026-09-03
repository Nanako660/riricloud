import { randomInt } from 'node:crypto';
import { findAvailableRandomPort, RANDOM_SERVICE_PORT_MAX, RANDOM_SERVICE_PORT_MIN } from './ports';

jest.mock('node:crypto', () => ({ randomInt: jest.fn() }));

describe('random service ports', () => {
  it('uses the valid port upper bound for random allocation', async () => {
    const mockedRandomInt = randomInt as unknown as jest.MockedFunction<(min: number, max: number) => number>;
    mockedRandomInt.mockReturnValue(RANDOM_SERVICE_PORT_MAX);

    await expect(findAvailableRandomPort(() => true)).resolves.toBe(RANDOM_SERVICE_PORT_MAX);
    expect(mockedRandomInt).toHaveBeenCalledWith(RANDOM_SERVICE_PORT_MIN, RANDOM_SERVICE_PORT_MAX + 1);
  });
});

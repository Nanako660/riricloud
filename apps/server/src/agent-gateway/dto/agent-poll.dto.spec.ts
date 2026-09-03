import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AgentPollDto } from './agent-poll.dto';

describe('AgentPollDto', () => {
  const createDto = (uploadTotal: string, downloadTotal = '0') => plainToInstance(AgentPollDto, {
    protocolVersion: 2,
    cpuUsage: 1,
    memoryUsage: 2,
    bandwidthRate: 3,
    trafficSnapshots: [{ userUuid: 'user@example.com', uploadTotal, downloadTotal }]
  });

  it('接受最大 uint64 累计值', async () => {
    const errors = await validate(createDto('18446744073709551615'));
    expect(errors).toHaveLength(0);
  });

  it.each([
    '18446744073709551616',
    '01',
    'not-a-number'
  ])('拒绝非法累计值 %s', async (uploadTotal) => {
    const errors = await validate(createDto(uploadTotal));
    expect(errors.some((error) => error.property === 'trafficSnapshots')).toBe(true);
  });
});

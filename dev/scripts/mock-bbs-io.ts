/**
 * Mock BBS IO for harnessed doors
 * Provides basic stdin/stdout helpers via environment variables.
 */

const DEFAULT_INPUT = '\r\n';

function getMockEnv(user = 'tester', node = '1', input = DEFAULT_INPUT) {
  return {
    BBS_HARNESS: '1',
    BBS_USER: user,
    BBS_NODE: node,
    BBS_INPUT: input,
    BBS_ANSI: '0'
  };
}

module.exports = {
  getMockEnv,
  DEFAULT_INPUT
};

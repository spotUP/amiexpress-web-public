/**
 * Mock BBS IO for harnessed doors
 * Provides basic stdin/stdout helpers via environment variables.
 */

function getMockEnv(user = 'tester', node = '1') {
  return {
    BBS_HARNESS: '1',
    BBS_USER: user,
    BBS_NODE: node
  };
}

module.exports = {
  getMockEnv
};

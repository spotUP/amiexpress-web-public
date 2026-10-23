import { isPlaceholderSecret, jwtSecret, jwtRefreshSecret } from '../../src/utils/jwt-secrets';

describe('placeholder token secrets', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it.each(['CHANGE_ME', 'your_jwt_secret_here', 'your_session_secret_here', '',
    'amiexpress-secret-key-change-in-production'])('treats %j as a placeholder', (value) => {
    expect(isPlaceholderSecret(value)).toBe(true);
  });

  it('accepts a real random value', () => {
    expect(isPlaceholderSecret('f3a9c1d27be84a5f90aa11c2d3e4f5061728394a5b6c7d8e')).toBe(false);
  });

  it('production refuses a placeholder JWT_SECRET and JWT_REFRESH_SECRET', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'CHANGE_ME';
    process.env.JWT_REFRESH_SECRET = 'your_jwt_secret_here';
    expect(() => jwtSecret()).toThrow(/placeholder/);
    expect(() => jwtRefreshSecret()).toThrow(/placeholder/);
  });

  it('production accepts a real value; development keeps its fixed key', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-random-value-0123456789abcdef';
    expect(jwtSecret()).toBe('a-real-random-value-0123456789abcdef');
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'CHANGE_ME';
    expect(jwtSecret()).toBe('CHANGE_ME');
  });
});

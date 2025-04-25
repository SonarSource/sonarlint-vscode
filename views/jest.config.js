/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  preset: 'ts-jest',
  roots: ['src', 'test/src'],
  moduleFileExtensions: ["js", "jsx", "ts", "tsx"],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '\\.pnp\\.cjs$'
  ],
  moduleNameMapper: {
    '\\.(css)$': 'identity-obj-proxy',
  },
};

module.exports = {
  preset: 'jest-expo',
  // pnpm monorepo: hoisted packages resolve to ../../node_modules/.pnpm, outside
  // the default root, so widen the scope and let the preset's transform whitelist them.
  roots: ['<rootDir>', '<rootDir>/../..'],
};

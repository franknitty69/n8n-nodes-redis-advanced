module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/nodes/RedisEnhanced/__tests__'],
	testMatch: ['**/nodes/RedisEnhanced/__tests__/**/*.test.ts'],
	transform: {
		'^.+\\.ts$': 'ts-jest',
	},
	collectCoverageFrom: [
		'nodes/**/*.ts',
		'credentials/**/*.ts',
		'!nodes/**/*.d.ts',
		'!credentials/**/*.d.ts',
		'!**/node_modules/**',
		'!**/__tests__/**',
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	testTimeout: 10000,
};

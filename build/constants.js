const constants = {};

Object.defineProperty(constants, 'UNIVERSAL_PLATFORM', {
	value: 'universal',
	writable: false
});

Object.defineProperty(constants, 'LATEST_JRE', {
	value: 17,
	writable: false
});

Object.defineProperty(constants, 'TARGETED_PLATFORMS', {
	value: ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'],
	writable: false
});

module.exports = constants;
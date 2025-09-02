module.exports = {
  mongodbMemoryServerOptions: {
    binary: {
      version: '6.0.0',
      skipMD5: true,
    },
    instance: {
      dbName: 'parking_logs_test',
    },
    autoStart: false,
  },
};

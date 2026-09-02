// 测试环境初始化
process.env.RUN_MODE = 'local';
process.env.DB_TYPE = 'sqlite';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '7d';
process.env.UPLOAD_DIR = './tests/_temp/uploads';
process.env.DATA_DIR = './tests/_temp/data';
process.env.LOG_LEVEL = 'error';
process.env.PORT = '3999';

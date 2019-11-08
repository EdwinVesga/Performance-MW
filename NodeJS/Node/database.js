const util = require('util')
const mysql = require('mysql')

const pool = mysql.createPool({
    waitForConnections: true,
    queueLimit: 0,
    connectionLimit: 100000,
    connectTimeout: 60*60*1000,
    acquireTimeout: 60*60*1000,
    timeout: 60*60*1000,
    maxConnextionTimeout: 1000000,
    errorLimit: 100000,
    host: 'db',
    user: 'performance',
    password: '123456',
    database: 'universidad',
    debug: false
})

module.exports = pool

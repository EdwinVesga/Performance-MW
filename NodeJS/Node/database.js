const util = require('util')
const mysql = require('mysql')

const pool = mysql.createPool({
    connectionLimit: 100000,
    host: 'db',
    user: 'performance',
    password: '123456',
    database: 'universidad',
    debug: false
})

// Promisify para Node.js async/await.
pool.query = util.promisify(pool.query)

module.exports = pool

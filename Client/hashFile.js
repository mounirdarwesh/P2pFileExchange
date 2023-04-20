const crypto = require('crypto')
const fs = require('fs')

// create a function in nodejs that synchronously hash entire file
// and then return the digest back and export it as a module

module.exports = (filepath) => {
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(filepath)
  hash.update(data)
  return hash.digest('hex')
}

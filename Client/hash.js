const crypto = require('crypto')
const fs = require('fs')

//* synchronously hash entire file and then return the digest back

module.exports = (filepath) => {
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(filepath)
  hash.update(data)
  return hash.digest('hex')
}

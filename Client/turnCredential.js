const crypto = require('crypto')

function getTURNCredentials (name, secret) {
  const unixTimeStamp = parseInt(Date.now() / 1000) + 24 * 3600// this credential would be valid for the next 24 hours
  const username = [unixTimeStamp, name].join(':')
  const hmac = crypto.createHmac('sha1', secret)
  hmac.setEncoding('base64')
  hmac.write(username)
  hmac.end()
  const password = hmac.read()
  // console.log(username + ' ' + password)
  return {
    username,
    password
  }
}

module.exports = getTURNCredentials('', '3f8CKxRaESW3hSkV')

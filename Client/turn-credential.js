const crypto = require('crypto')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

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

module.exports = getTURNCredentials(process.env.TURN_USERNAME, process.env.TURN_PASSWORD)

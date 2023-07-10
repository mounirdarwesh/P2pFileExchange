'use strict'

const { readFileSync } = require('fs')
const { createServer } = require('https')
const { Server } = require('socket.io')
const path = require('node:path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const { RateLimiterMemory } = require('rate-limiter-flexible')
const { Redis } = require('ioredis')
const { createAdapter } = require('@socket.io/redis-adapter')

//* Redis DB to manage the Online Users Entries
const redis = new Redis({ host: 'redis' })
//* on Start flush db.
redis.flushdb()

//* PubSub Client to exchange the Messages between the Servers
const pubClient = redis.duplicate()
const subClient = redis.duplicate()

pubClient.on('error', (err) => {
  console.log(err)
})
subClient.on('error', (err) => {
  console.log(err)
})

//* create https Server with self signed Certificate
const httpsServer = createServer({
  key: readFileSync(path.join(__dirname, './assets/key.pem')),
  cert: readFileSync(path.join(__dirname, './assets/cert.pem')),
  requestCert: true,
  ca: [
    readFileSync(path.join(__dirname, './assets/client-cert.pem'))
  ]
})

//* create Rate Limiter object for every connection has per seconde 5 point to consume.
const rateLimiter = new RateLimiterMemory(
  {
    points: 5, // 5 points
    duration: 1 // per second
  })

//* Socket.io Object
const io = new Server(httpsServer, { /* here to update the path */ })

io.adapter(createAdapter(pubClient, subClient))

const NAME = process.env.NAME

//* Counter for the Online Users
let NUM = 0

//* Map to manage the Online Users Entries and send Messages to specific user
// ? DB for user Authentication. (Future work for every Client Certificate and Password)
// const users = new Map()

//* Rate limiter to Protect the Server form DDoS and brute force attacks
io.use((client, next) => {
  const ip = client.handshake.headers['x-real-ip'] || client.handshake.address
  rateLimiter.consume(ip, 1)
    .then(() => {
      // * it will be passed to the next Middleware using the next()
      next()
    })
    .catch(() => {
      next(new Error('Too many requests'))
    })
})

//* Middleware to handle Logging and Authentication
io.use((client, next) => {
  const sender = client.handshake.auth.sender

  redis.exists(sender, (err, reply) => {
    if (err) {
      next(err)
    }
    //* if username already exist.
    if (reply === 1) {
      const err = new Error('Username is already Exist, please choose another.')
      next(err)
      console.log('Username is already Exist')
    }
  })

  //* disconnect Client if the Credentials wrong
  //* that ensure the Authenticity of the Client, because DTLS provides just encryption and integrity
  //* CIA Principe
  if (client.handshake.auth.token !== process.env.SECRET_KEY) {
    const err = new Error('Wrong Credentials.')
    next(err)
  }
  next()
})

//* Fired on new Client connect
io.on('connection', client => {
  //* username of the sender and recipient
  const sender = client.handshake.auth.sender
  let receiver

  //* save the Username and his ID
  redis.exists(sender, (err, reply) => {
    if (err) {
      console.error(err)
    }
    //* if username not exist.
    if (reply === 0) {
      redis.set(sender, client.id)
    }
  })

  // //* print the Map entries
  // for (const [key, value] of users) {
  //   console.log(key + ' = ' + value)
  // }

  //* increase the Count of Online Users
  NUM++
  console.log(`${sender} has Joined, # of Online Users ` + NUM)

  client.on('get_receiver', (data) => {
    receiver = data.receiver
    //* check if the Receiver Online
    redis.exists(receiver, (err, reply) => {
      if (err) {
        console.error(err)
      }
      //* username not Online.
      if (reply === 0) {
        redis.get(sender, (err, receiverClientID) => {
          if (err) {
            console.error(err)
          }

          io.to(receiverClientID).emit('receiverStatus', false)
        })

        console.log(`Receiver ${receiver} is not Online, Sender ${sender} `)
      } else {
        console.log(`Receiver ${receiver} is Online, Sender ${sender} `)
        redis.get(sender, (err, receiverClientID) => {
          if (err) {
            console.error(err)
          }

          io.to(receiverClientID).emit('receiverStatus', true)
        })
      }
    })
  })

  //* handle Calling event form the Sender and redirect it to the intended recipient
  client.on('calling', (callerID) => {
    // console.log(`calling  ${receiver} ${performRedisOperation('get', receiver)} `)
    redis.get(receiver, (err, receiverClientID) => {
      if (err) {
        console.error(err)
        return
      }

      io.to(receiverClientID).emit('calling', callerID)
    })
  })

  //* Fired when the Sender send Offer
  client.on('offer', (data) => {
    redis.get(receiver, (err, receiverClientID) => {
      if (err) {
        console.error(err)
        return
      }

      io.to(receiverClientID).emit('offer', data)
    })
  })

  //* Fired when the recipient send Answer back
  client.on('answer', (data) => {
    // * sometimes the socket id is not sent ( undefined ) (solved)
    io.to(data.to).emit('answer', data)
  })

  //* if any Client disconnect, decrease the Number of online User and tell other Users
  client.on('disconnect', () => {
    //* when a user disconnect delete his record in the Map.
    redis.del(sender)
    //* decrease the Number of Online Users
    NUM--
    console.log(`${sender} Client is disconnected, # of Online Users ` + NUM)
    io.sockets.emit('socketDisconnect', 'a Client has been disconnected!')
  })
})

//* Start the Server on Port 3000
httpsServer.listen(process.env.PORT, () => { console.log(`Server ${NAME} is Listening on Port ${process.env.PORT}... `) })

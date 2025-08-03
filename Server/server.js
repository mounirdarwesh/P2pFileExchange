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

//* create https Server with self signed Certificate
const httpsServer = createServer({
  key: readFileSync(path.join(__dirname, './assets/server-key.pem')),
  cert: readFileSync(path.join(__dirname, './assets/server-cert.pem')),
  requestCert: true,
  rejectUnauthorized: true,
  ca: [
    readFileSync(path.join(__dirname, './assets/ca-cert.pem'))
  ]
})

// httpsServer.on('tlsClientError', (err, socket) => {
//   console.error('TLS Client Error:', err.message);
//   console.error('Error code:', err.code);
// });

// httpsServer.on('secureConnection', (socket) => {
//   const cert = socket.getPeerCertificate();
//   console.log('Client cert:', cert);
// });

//* create Rate Limiter object for every connection has per seconde 5 point to consume.
const rateLimiter = new RateLimiterMemory(
  {
    points: 5, // 5 points
    duration: 1 // per second
  })

//* Socket.io Object
const io = new Server(httpsServer, { /* here to update the path */ })

io.adapter(createAdapter(pubClient, subClient))

const NAME_OF_SERVER = process.env.NAME
const USER_EXISTS = 1
const USER_NOT_EXISTS = 0

//* Counter for the Online Users
let numberOfUsers = 0

//* PubSub errors
pubClient.on('error', (err) => {
  console.log(err)
})
subClient.on('error', (err) => {
  console.log(err)
})

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
  const SENDER = client.handshake.auth.sender
  let receiver

  //* save the Username and his ID
  redis.exists(SENDER, (err, reply) => {
    if (err) {
      console.error(err)
    }
    if (reply === USER_EXISTS) {
      redis.del(SENDER)
    }
    redis.set(SENDER, client.id)
  })

  //* increase the Count of Online Users
  numberOfUsers++
  console.log(`${SENDER} has Joined, # of Online Users ` + numberOfUsers)

  client.on('get_receiver', (data) => {
    receiver = data.receiver
    //* check if the Receiver Online
    redis.exists(receiver, (err, reply) => {
      if (err) {
        console.error(err)
      }
      //* username not Online.
      if (reply === USER_NOT_EXISTS) {
        redis.get(SENDER, (err, receiverClientID) => {
          if (err) {
            console.error(err)
          }

          io.to(receiverClientID).emit('receiverStatus', false)
        })

        console.log(`Receiver ${receiver} is not Online, Sender ${SENDER} `)
      } else {
        console.log(`Receiver ${receiver} is Online, Sender ${SENDER} `)
        redis.get(SENDER, (err, receiverClientID) => {
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
    redis.del(SENDER)
    //* decrease the Number of Online Users
    numberOfUsers--
    console.log(`${SENDER} Client is disconnected, # of Online Users ` + numberOfUsers)
    io.sockets.emit('socketDisconnect', 'a Client has been disconnected!')
  })

  client.on('connect_error', (err) => {
    console.error(err.message)
    //* when a user disconnect delete his record in the Map.
    redis.del(SENDER)
    //* decrease the Number of Online Users
    numberOfUsers--
    console.log(`${SENDER} Client is disconnected due an Error, # of Online Users ` + numberOfUsers)
  })
})

//* Start the Server on Port 3000
httpsServer.listen(process.env.PORT, () => { console.log(`Server ${NAME_OF_SERVER} is Listening on Port ${process.env.PORT}... `) })

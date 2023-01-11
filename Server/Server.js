'use strict'

const { readFileSync } = require('fs')
const { createServer } = require('https')
const { Server } = require('socket.io')
const path = require('node:path')

// * create https Server with self signed Certificate
const httpServer = createServer({
  key: readFileSync(path.join(__dirname, './assets/key.pem')),
  cert: readFileSync(path.join(__dirname, './assets/cert.pem')),
  requestCert: true,
  ca: [
    readFileSync(path.join(__dirname, './assets/client-cert.pem'))
  ]
})

//* Socket.io Object
// ! change the path
const io = new Server(httpServer, { /* update path */ })

//* Counter for the Online Users
let NUM = 0

//* Map to manage the Online Users Entries and send Messages to specific user
// ? DB for user Authentication.
const users = new Map()

//* Middleware to handle Logging and Authentication
io.use((client, next) => {
  const sender = client.handshake.auth.sender
  // const receiver = client.handshake.auth.receiver

  //* if username already exist in the hashmap.
  if (users.has(sender)) {
    const err = new Error('Username is already Exist, please choose another.')
    next(err)
    console.log('Username is already Exist')
  }

  //* disconnect Client if the Receiver name is not correct or Offline
  // if (!users.has(receiver) && client.handshake.auth.initiator === false) {
  //   const err = new Error('Receiver name is not correct or he is Offline.')
  //   next(err)
  //   console.log('Recipient dose not exist or offline.')
  //   // TODO fallback in case the recipient dose not exist or is not Online
  //   // it should not happen as long as the recipient requested the Data
  // }

  //* disconnect Client if the Credentials wrong
  //* that ensure the Authenticity of the Client, because DTLS provides just encryption and integrity
  //* CIA Principe
  if (client.handshake.auth.token !== 'V@6wcY1Vh8l78zLMZ126') {
    const err = new Error('Wrong Credentials.')
    next(err)
  }
  next()
})

//* Fired on new Client connect
io.on('connection', client => {
  //* username of the sender and recipient
  const sender = client.handshake.auth.sender
  let receiver // = client.handshake.auth.receiver

  //* save the Username and his ID in the HashMap
  if (!users.has(sender)) {
    users.set(sender, client.id)
  }

  //* print the Map entries
  for (const [key, value] of users) {
    console.log(key + ' = ' + value)
  }

  client.on('connect', () => {
  })

  //* increase the Count of Online Users
  NUM++
  console.log('a Client has Joined, # of Online Users ' + NUM)

  client.on('message', (data) => {
    io.to(users.get(receiver)).emit('message', data)
  })

  client.on('get_receiver', (data) => {
    // io.to(users.get(receiver)).emit('message', data)
    receiver = data.receiver
    console.log(receiver + ' got the receiver from IPC')
  })

  //* handle Calling event form the Sender and redirect it to the intended recipient
  client.on('calling', (callerID) => {
    console.log(`calling  ${receiver} ${users.get(receiver)} `)
    io.to(users.get(receiver)).emit('calling', callerID)
  })

  //* Fired when the Sender send Offer
  client.on('offer', (data) => {
    io.to(data.to).emit('offer', data)
    console.log(data)
  })

  //* Fired when the recipient send Answer back
  client.on('answer', (data) => {
    // * sometimes the socket id is not sent ( undefined ) (solved)
    io.to(users.get(receiver)).emit('answer', data)
  })

  //* if any Client disconnect, decrease the Number of online User and tell other Users
  client.on('disconnect', () => {
    //* when a user disconnect delete his record in the Map.
    users.delete(sender)
    //* decrease the Number of Online Users
    NUM--
    console.log('a Client is disconnected, # of Online Users ' + NUM)
    io.sockets.emit('socketDisconnect', 'a Client has been disconnected!')
  })
})

//* Start the Server on Port 3000
httpServer.listen(3000, () => { console.log('Server is Listening on Port 3000 🚀... ') })

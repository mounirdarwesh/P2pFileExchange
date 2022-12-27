'use strict'

/* eslint-disable object-shorthand */
/* eslint-disable space-before-function-paren */
const net = require('net')
const { readFileSync, readFile, writeFile, createReadStream, createWriteStream } = require('fs')
const { io } = require('socket.io-client')
const Peer = require('simple-peer')
const wrtc = require('wrtc')
const path = require('node:path')
const turnCredential = require('./turnCredential')

//* tcp socket to create IPC channel
const client = new net.Socket()
const port = 6868
const host = '127.0.0.1'

client.connect(port, host, () => {
  console.log('Connected to IPC')
  // client.write('Hello From Client ' + client.address().address)
})

//* get mode form arguments, weather sender or recipient
// let mode = process.argv.at(2)

//* Process Arguments to differentiate between sender and recipient
// sender is Username
const sender = process.argv.at(2) === undefined
  ? console.log('Sender Name is Missing')
  : process.argv.at(2).toString()
// if the exe in receive mode there is no need to the 4th arg.
// let receiver = mode === 'init' ? null : process.argv.at(4).toString()

client.on('data', (data) => {
  //! it should first the init connection destroyed and as rec connected.
  const ipcData = JSON.parse(data)
  //* send a Request to Peer
  const socket = new SocketInstance().newSocket(false, ipcData.sender, ipcData.receiver)
  const callee = new PeerConn(false, socket)
  callee.connect()
})

client.on('close', () => {
  console.log('Connection closed')
  setTimeout(() => process.exit(), 50)
})

client.on('error', () => {
  console.log('Connection to Java Process can not be established')
  setTimeout(() => process.exit(), 50)
})

//* Class to create new WebSocket Connection
class SocketInstance {
  //* Instantiate new socket.io connection
  newSocket(initiator, sender, receiver) {
    // * new secure Socket.io instance with Client side Certificate for more Security
    // * and Authenticity and Token as a Client Password.
    const socket = io('https://localhost:3000', {
      auth: {
        // ! token should be given as a Parameter
        // ? validate the input.
        token: 'V@6wcY1Vh8l78zLMZ126',
        sender: sender,
        receiver: receiver,
        initiator: initiator
      },
      ca: readFileSync(path.join(__dirname, 'certificate/cert.pem')),
      cert: readFileSync(path.join(__dirname, 'certificate/client-cert.pem')),
      key: readFileSync(path.join(__dirname, 'certificate/client-key.pem')),
      rejectUnauthorized: false
      // trickle: false
    })

    //* check before if the socket connected without errors
    socket.on('connect_error', (err) => {
      console.log(err.message)
      setTimeout(() => process.exit(), 50)
    })

    //* on Connect event
    socket.on('connect', (client) => {
      console.log(`connected to WebSocket with id ${socket.id}`)
      //* if its the Sender, Call the other Peer and give him the ID of the Sender
      //* to talk him back
      if (!initiator) {
        socket.emit('calling', socket.id)
      }
    })

    //* get new Data Channel session and the ID of the Sender
    socket.on('calling', (callerID) => {
      console.log('Ringing')
      if (initiator) {
        const callee = new PeerConn(true, socket, callerID)
        callee.connect()
      }
    })

    //* if the Connection form the Server side has been disconnected
    socket.on('disconnect', (err) => {
      console.log(err)
    })

    return socket
  }
}

//* Class to create new Peer DataChannel and to communicate with the other Peer
class PeerConn {
  //* pass initiator param to know if its sender or recipient mode
  //* as well the socket object to handle the Signaling
  constructor(initiator, socket, callerID) {
    this.initiator = initiator
    this.socket = socket
    //* own TURN and STUN Server.
    this.peer = new Peer({
      initiator: this.initiator,
      wrtc,
      config: {
        //* force to use just the TURN server.
        // iceTransportPolicy: 'relay',
        iceServers: [
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:global.stun.twilio.com:3478',
              'stun:video.termininfo.de:3478'
            ]
          },
          {
            urls: 'turn:video.termininfo.de:3478',
            username: turnCredential.username,
            credential: turnCredential.password
          }
        ]
      }
    })
    this.caller = callerID
  }

  // * connect to the other Party
  connect() {
    //* handle offer data for the recipient
    this.socket.on('offer', (data) => {
      //* set local and remote sdp and emit answer
      this.peer.signal(JSON.stringify(data.signalData))
    })

    //* handle the answer for the Sender
    this.socket.on('answer', (data) => {
      this.peer.signal(JSON.stringify(data.signalData))
    })

    //* when a socket from other Client from the Server has been disconnected
    this.socket.on('socketDisconnect', data => {
      console.log(data)
    })

    //* Fired when the peer wants to send signaling data to the remote peer.
    //* in case of the sender, it will call immediately after peer Instantiation
    //* in case of the recipient, it will fire after receiving and Offer.
    this.peer.on('signal', signalData => {
      if (this.initiator) {
        console.log('offer data has been emitted!')
        this.socket.emit('offer', { signalData, to: this.caller })
      } else {
        console.log('Answer Created')
        this.socket.emit('answer', { signalData, from: this.socket.id })
      }
    })

    //* Fired after successful Peer Connection.
    this.peer.on('connect', () => {
      console.log('connected to other peer successfully')
      //* wait for 'connect' event before using the data channel
      // *read file form file System and send it through the DataChannel

      if (this.initiator) {
        //* call read file
        this.readPeerFileStream()
      }
    })

    //* Fired if a Peer gets an new Data form the second Peer.
    this.peer.on('data', data => {
      //* got a data channel message
      if (this.initiator) {
        // console.log('got a message from peer: ' + data)
        console.log('got a message from peer: ')
      } else {
        // console.log('got a message from peer: ' + data)
        console.log('got a message from peer: ')
        this.peer.send('good!')
        //* call write file
        this.writePeerFileStream(data)
      }
    })

    //* Fired if any Peer close the Data Channel
    this.peer.on('close', () => {
      console.log('WebRTC DataChannel connection is closed ')

      if (this.initiator) {
        this.peer.destroy()
        this.socket.disconnect()
        // global.gc() there is no need to call GC
        // * there was a Problem with "cannot signal after destroy" because the
        // * old socket event hooked in the old Peer instance (solved)
        setTimeout(() => {
          new SocketInstance().newSocket(true)
        }, 100)
      }
    })
  }

  readPeerFile() {
    readFile('./data.json', 'utf8', (error, data) => {
      if (error) {
        console.log(error)
        return
      }
      this.peer.send(data)
    })
  }

  readPeerFileStream() {
    const readerStream = createReadStream('./data.json', 'UTF8')
    readerStream.on('data', (chunk) => {
      // console.log(chunk)
      this.peer.send(chunk)
    })

    readerStream.on('end', function () {
      console.log('finished with reading (Stream API)')
    })

    readerStream.on('error', function (err) {
      console.log(err.stack)
    })
  }

  writePeerFile(data) {
    //* write the JSON file into the File System
    writeFile('dataFromPeer.json', data, (err) => {
      //* If there is any error in writing to the file, return
      if (err) {
        console.error(err)
        return
      }
      //* Log this message if the file was written to successfully
      console.log('wrote to file successfully')
      //* after successfully write the file disconnect peer connection
      //* and start new one
      this.peer.destroy()
      this.socket.disconnect()
    })
  }

  writePeerFileStream(data) {
    //* write the JSON file into the File System
    const writerStream = createWriteStream('./dataFromPeer.json')
    writerStream.write(data, 'UTF8')

    // Mark the end of file
    writerStream.end()

    // Handle stream events --> finish, and error
    writerStream.on('finish', () => {
      console.log('Write completed.')
    })

    writerStream.on('error', (err) => {
      console.log(err.stack)
    })

    //* after successfully write the file disconnect peer connection
    this.peer.destroy()
    this.socket.disconnect()
    //* and Exit
    setTimeout(() => process.exit(), 50)
  }
}

//* entry Point of the Sender
// if (mode === 'init') {
new SocketInstance().newSocket(true, sender)
// }
//* entry Point of the Recipient
// if (mode === 'rec') {
//   // const socket = new SocketInstance().newSocket(false)
//   // const callee = new PeerConn(false, socket)
//   // callee.connect()
// }

// node Client.js rec dar mou
// node Client.js init mou

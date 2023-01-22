'use strict'

/* eslint-disable object-shorthand */
/* eslint-disable space-before-function-paren */
const { renameSync, unlink, readFileSync, createReadStream, createWriteStream } = require('fs')
const { io } = require('socket.io-client')
const Peer = require('simple-peer')
const wrtc = require('wrtc')
const path = require('node:path')
const turnCredential = require('./turnCredential')
const folderHandler = require('./folderHandler')

//* read the ID of the Sender from the File System
let sender = readFileSync(path.join(__dirname, 'file_exchange', 'ID.txt'), 'utf8',
  function (err, data) {
    if (err) {
      console.log('Sender ID is Missing' + err)
      process.exit(1)
    }
    sender = data
  }
)

//* read the Files from sendData Folder that should be sent
let sortedFiles = folderHandler(path.join(__dirname, 'file_exchange/sendData'))
// console.log(sortedFiles.length)
//* Array to save Offline Peers Files
// TODO check periodically if the peer in online
const offlineUserData = []

//* Class to create new WebSocket Connection
class SocketInstance {
  //* Instantiate new socket.io connection
  newSocket(sender) {
    let receiver = sortedFiles.length === 0 ? null : sortedFiles[0].name.split('_').at(1)
    // * new secure Socket.io instance with Client side Certificate for more Security
    // * and Authenticity and Token as a Client Password.
    const socket = io('https://localhost:3000', {
      auth: {
        // ! token should be given as a Parameter
        // ? validate the input.
        token: 'V@6wcY1Vh8l78zLMZ126',
        sender: sender
        // receiver: receiver,
        // initiator: initiator
      },
      ca: readFileSync(path.join(__dirname, 'certificate/cert.pem')),
      cert: readFileSync(path.join(__dirname, 'certificate/client-cert.pem')),
      key: readFileSync(path.join(__dirname, 'certificate/client-key.pem')),
      rejectUnauthorized: false
      // trickle: false
    })

    //* this function make an event return a Promise.
    function waitForEvent(eventName) {
      return new Promise((resolve, reject) => {
        socket.on(eventName, (data) => {
          console.log(`User ${receiver} is Online: ${data}`)
          resolve(data)
        })
      })
    }

    function transfer() {
      // TODO let this periodically happens
      //* if there is file to be transfer
      if (sortedFiles.length > 0) {
        //* get the receiver ID
        receiver = sortedFiles[0].name.split('_').at(1)

        // * send the Receiver name first,to get his socket ID and to check if he is Online.
        socket.emit('get_receiver', { receiver: receiver })

        // ? without the semicolon the IIFE will be assigned to online var.
        let online = true;
        //* Immediately invoked function expression (IIFE)
        (async () => {
          //* get from Signaling Server if the Receiver Online
          online = await waitForEvent('receiverStatus')
          if (online) {
            // * call the other Receiver.
            socket.emit('calling', socket.id)

            //* init a new WebRTC Connection to the Receiver
            const callee = new PeerConn(true, socket)
            callee.connect(receiver)
          } else {
            //* the Peer is Offline
            moveOfflineUserData(receiver)
          }
        })()
      }
      if (sortedFiles.length === 0) {
        //* when the array is empty refill it from folder
        sortedFiles = folderHandler(path.join(__dirname, 'file_exchange/sendData'))
      }
    }

    //* if the Peer Offline, his Files should be moved to Another Array and Folder
    function moveOfflineUserData(offlineUser) {
      sortedFiles.forEach((file) => {
        if (file.name.split('_').at(1) === offlineUser) {
          offlineUserData.push(file)
          renameSync('./file_exchange/sendData/' + file.name, './file_exchange/offlineReceiver/' + file.name, (err) => {
            if (err) {
              throw err
            }
            console.log('File moved successfully!')
          })
        }
      })
      sortedFiles = sortedFiles.filter(file => file.name.split('_').at(1) !== offlineUser)
    }

    //* on Connect event
    socket.on('connect', (client) => {
      console.log(`connected to WebSocket with id ${socket.id}`)

      transfer()
      setInterval(() => {
        transfer()
      }, 10000)
      // TODO handle offline Peer Data
    })

    //* init a Data Channel when the Sender rings
    socket.on('calling', (callerID) => {
      console.log('Ringing')
      const callee = new PeerConn(false, socket, callerID)
      callee.connect()
    })

    //* if the Connection form the Server side has been disconnected
    socket.on('disconnect', (err) => {
      console.log(err)
    })

    //* check before if the socket connected without errors
    socket.on('connect_error', (err) => {
      console.log(err.message)
      //! setTimeout(() => process.exit(), 50)
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
  connect(receiver) {
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
        this.socket.emit('offer', { signalData, from: this.socket.id })
      } else {
        console.log('Answer Created')
        this.socket.emit('answer', { signalData, to: this.caller })
      }
    })

    this.peer.on('connect', () => {
      console.log('connected to other peer successfully')
      //* if its the Sender
      if (this.initiator) {
        //* move all receiver file to another Array to iterate over it
        const toSend = []
        sortedFiles.forEach((file) => {
          if (file.name.split('_').at(1) === receiver) {
            toSend.push(file)
          }
        })
        //* call read file
        const total = toSend.length
        //* recursive function to send the file sequentially and at the end close the Connection
        const sendNextFile = (index) => {
          if (index >= total) {
            // all files have been sent
            //! (solved) the last file is not deleted from sendData because the rtc
            //! Connection is getting closed before the last acknowledgement received
            setTimeout(() => {
              this.peer.destroy()
              this.socket.disconnect()
              // setTimeout(() => {
              //   new SocketInstance().newSocket(true, sender)
              // }, 200)
            }, 100)
            return
          }

          this.readPeerFileStream('./file_exchange/sendData/' + toSend[index].name, toSend[index].name)
            .then(() => {
              sendNextFile(index + 1)
            })
            .catch(error => {
              console.log(error)
            })
        }
        sendNextFile(0)
      }
    })

    //* Fired if a Peer gets an new Data form the second Peer.
    this.peer.on('data', data => {
      //* got a data channel message
      if (this.initiator) {
        const ack = JSON.parse(data)
        console.log(ack.fileName)
        sortedFiles = sortedFiles.filter(file => file.name !== ack.fileName)
        this.deleteFileFromFs('./file_exchange/sendData/' + ack.fileName)
      } else {
        const gotFromPeer = JSON.parse(data)
        this.peer.send(JSON.stringify({ fileName: gotFromPeer.fileName }))
        //* call write file
        this.writePeerFileStream(gotFromPeer, 'file_exchange/receiveData/')
      }
    })

    //* Fired if any Peer close the Data Channel
    this.peer.on('close', () => {
      console.log('WebRTC DataChannel connection is closed ')

      this.peer.destroy()
      this.socket.disconnect()
      // global.gc() there is no need to call GC
      // * there was a Problem with "cannot signal after destroy" because the
      // * old socket event hooked in the old Peer instance (solved)
      setTimeout(() => {
        new SocketInstance().newSocket(sender)
      }, 100)
    })
  }

  readPeerFileStream(path, fileName) {
    return new Promise((resolve, reject) => {
      const readerStream = createReadStream(path, 'UTF8')
      readerStream.on('data', (chunk) => {
        this.peer.send(JSON.stringify({ fileName: fileName, chunk: chunk }))
      })

      readerStream.on('end', () => {
        resolve()
      })

      readerStream.on('error', (err) => {
        reject(err)
      })
    })
  }

  writePeerFileStream(data, path) {
    //* write the JSON file into the File System
    const writerStream = createWriteStream(path + data.fileName)
    writerStream.write(data.chunk, 'UTF8')

    // Mark the end of file
    writerStream.end()

    // Handle stream events --> finish, and error
    writerStream.on('finish', () => {
      console.log('Write completed.')
    })

    writerStream.on('error', (err) => {
      console.log(err.stack)
    })
  }

  deleteFileFromFs(path) {
    unlink(path, (err) => {
      if (err) {
        console.error(err)
      }
    })
  }
}

//* entry Point
new SocketInstance().newSocket(sender)

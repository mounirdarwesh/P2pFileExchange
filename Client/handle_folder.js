const path = require('node:path')

// Import the filesystem module
const fs = require('fs')
let sender = fs.readFileSync(
  path.join(__dirname, 'file_exchange', 'ID.txt'),
  'utf8',
  function (err, data) {
    if (err) {
      console.log('Sender ID is Missing' + err)
      process.exit(1)
    }
    sender = data
  }
)
console.log(sender)

/* This function takes in a single argument, the path of the folder you want to read and sort, then using fs.readdirSync(folderPath) which returns an array of the names of the files in the folder and for each file using path.join(folderPath, file) creates the full path for the file and then using fs.statSync(filePath) get the mtime of the file and creates an object with file name, path and mtime and push it to fileObjs array.
Finally, it sorts the fileObjs array based on the modified time of the files by comparing b.mtime - a.mtime.
This function returns the sorted array of objects, each of which contains the name, path, and modified time of a file in the folder.

Please note that readdirSync and statSync are synchronous version of the methods, it may block the execution of the rest of the code while it reads the directory and the file status respectively. But they can be used in this scenario if you know that the folder is relatively small and it will not take much time to read and sort it.

Please also be aware that folderPath should be passed correctly, otherwise, it may throw the errors.

It's not recommended to use the synchronous version of the method in any production service, it would be better to use the asynchronous version and handle errors correctly with callback or promise.
*/
function readAndSortFolder (folderPath) {
  const files = fs.readdirSync(folderPath)
  const fileObjs = []
  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const stats = fs.statSync(filePath)
    fileObjs.push({
      name: file,
      path: filePath,
      mtime: stats.mtime
    })
  }
  fileObjs.sort((a, b) => {
    return Number(a.name.split('_').at(1)) - Number(b.name.split('_').at(1)) || a.mtime - b.mtime

    // if (Number(a.name.split('_').at(1)) > Number(b.name.split('_').at(1))) {
    //   return 1
    // }
    // if (Number(a.name.split('_').at(1)) < Number(b.name.split('_').at(1))) {
    //   return -1
    // }
    // if (a.mtime > b.mtime) {
    //   return 1
    // }
    // if (a.mtime < b.mtime) {
    //   return -1
    // }
    // return 0
    // fileObjs = a.name.split('_').at(1) > b.name.split('_').at(1)
    // return a.mtime - b.mtime
  })
  // fileObjs.sort((a, b) => {
  //   return a.mtime - b.mtime
  // })

  return fileObjs
}

const sortedFiles = readAndSortFolder(path.join(__dirname, 'file_exchange'))
console.log(sortedFiles)
console.log(sortedFiles.length)

console.log(10001.0 > 4714.0)
// const receiver = sortedFiles[0].name.split('_').at(1)
// console.log(receiver)

// fs.watch(path.join(__dirname, 'file_exchange'), (eventType, filename) => {
//   console.log('\nThe file', filename, 'was modified!')
//   console.log('The type of change was:', eventType)

//   sortedFiles = readAndSortFolder(path.join(__dirname, 'file_exchange'))
//   console.log(sortedFiles[0])
//   console.log(sortedFiles.length)
// })

/*
In the context of WebRTC, it is normal to establish a peer-to-peer (P2P) connection, send a file, and then close the connection. This is known as a "data channel" and is one of the key features of WebRTC. It allows for the efficient transfer of large amounts of data without the need for a dedicated server.

However, it is also possible to keep the connection open and use it for multiple file transfers. This can be more efficient, as it eliminates the overhead of establishing a new connection for each file transfer. This is also known as "persistent data channel" where you can use the same channel multiple time until you close it explicitly.

It depends on the use case and requirement, which method would be more appropriate.
______________________________________________________________________________
In the context of WebRTC, it is common to establish a peer-to-peer (P2P) connection and then use that connection to send files or other data. It is not necessary to close the connection after sending each file, as doing so would add additional latency and overhead. Instead, it is more efficient to keep the connection open and reuse it for subsequent file transfers or other data. Additionally, keeping the connection open can be beneficial for real-time communication applications as it avoid the overhead of initiating a new connection.
*/
// // Create an array to hold the data channels
// const dataChannelPool = []

// // Function to create a new data channel and add it to the pool
// function createAndPoolDataChannel (peerConnection) {
//   // Create a new data channel
//   const dataChannel = peerConnection.createDataChannel('myDataChannel')
//   // Add the data channel to the pool
//   dataChannelPool.push(dataChannel)
//   return dataChannel
// }

// // Function to retrieve a data channel from the pool
// function getDataChannelFromPool () {
//   // Check if there are any data channels available in the pool
//   if (dataChannelPool.length > 0) {
//     return dataChannelPool.shift()
//   } else {
//     // Create a new data channel if none are available in the pool
//     return createAndPoolDataChannel(peerConnection)
//   }
// }

// const sortedFiles = []
// const getSortedFiles = async (dir) => {
//   const files = await fs.promises.readdir(dir)

//   const filesSorted = files
//     .map((fileName) => ({
//       name: fileName,
//       time: fs
//         .statSync(path.join(__dirname, dir + '/' + fileName))
//         .mtime.getTime()
//     }))
//     .sort((a, b) => a.time - b.time)
//     .map((file) => file.name)

//   return filesSorted
// }

// Promise.resolve()
//   .then(() => getSortedFiles('file_exchange'))
//   .then(sortedFiles.push())
//   .catch(console.error)

// getSortedFiles('file_exchange').then((data) => {
//   data.forEach((file) => {
//     sortedFiles.push(file)
//   })
// })
// console.log(sortedFiles)

// function sortFilesByDate (folderPath) {
//   // read the contents of the folder
//   fs.readdir(folderPath, (err, files) => {
//     if (err) {
//       console.error(
//         `An error occurred while reading the contents of ${folderPath}`
//       )
//       return
//     }

//     // sort the files by modification date
//     files.sort((a, b) => {
//       const statsA = fs.statSync(`${folderPath}/${a}`)
//       const statsB = fs.statSync(`${folderPath}/${b}`)
//       return statsA.mtime.getTime() - statsB.mtime.getTime()
//     })

//     // console.log(files)

//     return files
//   })
// }

// let sortedF = sortFilesByDate(path.join(__dirname, 'file_exchange'))

// console.log(sortedF)

// Function to get current filenames
// in directory
// fs.readdir(path.join(__dirname, 'file_exchange'), (err, files) => {
//   if (err) console.log(err)
//   else {
//     console.log('\nCurrent directory filenames:')
//     console.log('Filenames with the .txt extension:')
//     files.forEach((file) => {
//       if (path.extname(file) === '.txt') {
//         console.log(fs.statSync(file).mtime)
//       }
//     })
//   }
// })

// Function to get current filenames
// in directory with "withFileTypes"
// set to "true"

// fs.readdir(__dirname, { withFileTypes: true }, (err, files) => {
//   console.log('\nCurrent directory files:')
//   if (err) console.log(err)
//   else {
//     files.forEach((file) => {
//       console.log(file)
//     })
//   }
// })

// async function getList() {
//   let data = await getSortedFiles()
//   console.log(data)
// }

// getList()
// Function to get current filenames
// in directory
// const sortedFiles = []

// fs.readdir(path.join(__dirname, 'file_exchange'), (err, files) => {
//   if (err) console.log(err)
//   else {
//     files
//       .map((fileName) => ({
//         name: fileName,
//         time: fs
//           .statSync(path.join(__dirname, 'file_exchange' + '/' + fileName))
//           .mtime.getTime(),
//       }))
//       .sort((a, b) => a.time - b.time)
//       .map((file) => sortedFiles.push(file.name))
//   }
// })

// console.log(sortedFiles)

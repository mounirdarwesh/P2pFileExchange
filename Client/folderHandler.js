const path = require('node:path')
const fs = require('fs')

function readAndSortFolder (folderPath) {
  const files = fs.readdirSync(folderPath)
  console.log(files)
  const fileObjs = []
  if (files.length !== 0) {
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
    })
  }
  return fileObjs
}
module.exports = readAndSortFolder
